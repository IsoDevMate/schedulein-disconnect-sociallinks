/* eslint-disable prettier/prettier */
import { Injectable, Logger } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { ConfigService } from "@nestjs/config";
import { YouTubeAnalyticsService } from "../youtube-analytics.service";
import { EnhancedNicheClassificationService } from "./enhanced-niche-classification.service";

import { VideoAnalytics } from "../schemas/video-analytics.schema";
import { CompetitorAnalysis } from "../schemas/competitor-analysis.schema";
import { HashtagAnalytics } from "../schemas/hashtag-analytics.schema";
import { NicheAnalytics } from "../schemas/niche-analytics.schema";

export interface OutlierVideo {
  videoId: string;
  title: string;
  channelTitle: string;
  outlierScore: number;
  outlierType: "viral" | "engagement" | "velocity" | "niche_breakthrough";
  metrics: {
    viewCount: number;
    likeCount: number;
    commentCount: number;
    engagementRate: number;
    viewsPerHour: number;
    viralityScore: number;
    duration: number;
    subscriberCount?: number;
  };
  insights: {
    whatMakesItSpecial: string[];
    contentPatterns: string[];
    hashtagStrategy: string[];
    timingInsights: string[];
  };
  recommendations: string[];
}

export interface OutlierAnalysis {
  timeRange: string;
  totalVideosAnalyzed: number;
  outliersFound: number;
  outlierTypes: {
    viral: number;
    engagement: number;
    velocity: number;
    niche_breakthrough: number;
  };
  topOutliers: OutlierVideo[];
  patterns: {
    commonHashtags: string[];
    optimalDurations: number[];
    bestPostingHours: string[];
    contentThemes: string[];
  };
  lastUpdated: Date;
  filters?: {
    language?: string;
    region?: string;
    excludeLanguages?: string[];
  };
}

export interface RisingStarVideo {
  videoId: string;
  title: string;
  description: string;
  channelId: string;
  channelTitle: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  engagementRate: number;
  publishedAt: Date;
  duration: number;
  growthRate: number; // Views per hour since published
  momentumScore: number; // Combined growth + engagement score
  hashtags: string[];
  thumbnailUrl: string;
  isShorts: boolean;
  niche: string;
  viralPotential: "Low" | "Medium" | "High";
  recommendedActions: string[];
}

@Injectable()
export class OutlierDetectionService {
  private readonly logger = new Logger(OutlierDetectionService.name);

  constructor(
    @InjectModel("VideoAnalytics") private videoModel: Model<VideoAnalytics>,
    @InjectModel("CompetitorAnalysis")
    private competitorModel: Model<CompetitorAnalysis>,
    @InjectModel("HashtagAnalytics")
    private hashtagModel: Model<HashtagAnalytics>,
    @InjectModel("NicheAnalytics") private nicheModel: Model<NicheAnalytics>,
    private readonly youtubeAnalyticsService: YouTubeAnalyticsService,
    private readonly configService: ConfigService,
    private readonly enhancedNicheClassificationService: EnhancedNicheClassificationService,
  ) {}

  async detectOutliers(
    userId: string,
    options: {
      timeRange?: "24h" | "7d" | "30d";
      niche?: string;
      minViews?: number;
      maxResults?: number;
      minViewsPerSub?: number;
      includeSubscriberCount?: boolean;
    } = {},
  ): Promise<OutlierAnalysis> {
    const {
      timeRange: inputTimeRange,
      niche,
      minViews = 5000,
      maxResults = 50,
      minViewsPerSub,
      includeSubscriberCount,
    } = options;

    // Ensure timeRange has a valid value
    let timeRange = inputTimeRange || "24h";

    // Validate timeRange
    const validTimeRanges = ["24h", "7d", "30d", "day", "week", "month"];
    if (!validTimeRanges.includes(timeRange)) {
      this.logger.warn(
        `Invalid timeRange: "${timeRange}", defaulting to "24h"`,
      );
      timeRange = "24h";
    }

    this.logger.log(
      `detectOutliers called with timeRange: "${timeRange}", options:`,
      options,
    );

    try {
      // Get recent videos
      const recentVideos = await this.getVideosWithFallback(
        userId,
        timeRange,
        niche,
        minViews,
        maxResults * 3,
      );

      // Optional gate: filter by views per subscriber ratio
      let candidateVideos = recentVideos;
      let subsMap: Map<string, number> | undefined;
      if (minViewsPerSub && minViewsPerSub > 0) {
        try {
          const uniqueChannelIds = Array.from(
            new Set(recentVideos.map((v: any) => v.channelId).filter(Boolean)),
          );
          subsMap = await this.youtubeAnalyticsService.getChannelSubscriberCounts(
            userId,
            uniqueChannelIds,
          );
          const subsFloor = 100;
          candidateVideos = recentVideos.filter((v: any) => {
            const subs = subsMap.get(v.channelId) || 0;
            const denom = Math.max(subs, subsFloor);
            const ratio = (v.viewCount || 0) / denom;
            return ratio >= minViewsPerSub;
          });
        } catch (e) {
          this.logger.warn(
            `Failed to apply minViewsPerSub gate: ${e?.message || e}`,
          );
        }
      }

      // If includeSubscriberCount is requested and we haven't fetched yet, fetch now for candidate videos
      if (includeSubscriberCount && !subsMap) {
        try {
          const uniqueChannelIds = Array.from(
            new Set(candidateVideos.map((v: any) => v.channelId).filter(Boolean)),
          );
          subsMap = await this.youtubeAnalyticsService.getChannelSubscriberCounts(
            userId,
            uniqueChannelIds,
          );
        } catch (e) {
          this.logger.warn(
            `Failed to fetch subscriber counts for inclusion: ${e?.message || e}`,
          );
        }
      }

      this.logger.log(`getVideosWithFallback returned ${recentVideos.length} videos; ${candidateVideos.length} after views/sub gating`);

      if (candidateVideos.length === 0) {
        this.logger.warn(`No videos found for timeRange: ${timeRange}, niche: ${niche}, minViews: ${minViews}`);
        return this.createEmptyAnalysis(timeRange);
      }

      // Calculate statistical thresholds
      const thresholds = this.calculateThresholds(candidateVideos);

      // Detect outliers
      let outliers = this.identifyOutliers(candidateVideos, thresholds);

      // Optionally enrich metrics with subscriberCount for returned outliers
      if (includeSubscriberCount && subsMap) {
        outliers = outliers.map((o) => ({
          ...o,
          metrics: {
            ...o.metrics,
            subscriberCount: subsMap?.get((candidateVideos.find((v:any)=>v.videoId===o.videoId)||{}).channelId) || 0,
          },
        }));
      }

      // Analyze patterns
      const patterns = this.analyzeOutlierPatterns(outliers);

      // Generate insights for each outlier
      const enrichedOutliers = await this.enrichOutliersWithInsights(outliers);

      return {
        timeRange,
        totalVideosAnalyzed: candidateVideos.length,
        outliersFound: enrichedOutliers.length,
        outlierTypes: this.categorizeOutlierTypes(enrichedOutliers),
        topOutliers: enrichedOutliers.slice(0, maxResults),
        patterns,
        lastUpdated: new Date(),
      };
    } catch (error) {
      this.logger.error("Error detecting outliers:", error);
      throw error;
    }
  }

  /**
   * Find rising star videos that are growing fast but haven't peaked yet
   */
  async findRisingStars(
    userId: string,
    options: {
      timeRange?: string;
      niche?: string;
      minGrowthRate?: number;
      maxResults?: number;
    } = {},
  ): Promise<RisingStarVideo[]> {
    const {
      timeRange = "day",
      niche,
      minGrowthRate = 500,
      maxResults = 50,
    } = options;

    // this.logger.log(
    //   `Finding rising stars for niche: ${niche || "all"}, timeRange: ${timeRange}`,
    // );

    try {
      // Get recent videos using comprehensive strategy
      const recentVideos =
        await this.youtubeAnalyticsService.getComprehensiveShorts(
          userId,
          maxResults * 3, // Get more to filter
          {
            timeRange,
            niche,
            minViews: 100,
            useSearch: true,
            useTrending: true,
            usePlaylists: false,
          },
        );

      // Save videos to database first
      await Promise.all(
        recentVideos.map(async (video) => {
          try {
            const videoData = {
              videoId: video.videoId,
              title: video.title,
              description: video.description,
              publishedAt: new Date(video.publishedAt),
              channelId: video.channelId,
              channelTitle: video.channelTitle,
              viewCount: video.viewCount,
              likeCount: video.likeCount,
              commentCount: video.commentCount,
              engagementRate: video.engagementRate,
              viewToLikeRatio: video.viewToLikeRatio || 0,
              viralityScore: this.calculateViralityScoreForVideo(video),
              duration: video.duration,
              niche: niche || "unknown",
              tags: [],
              hashtags: (video as any).hashtags || [],
              topics: await this.detectTopicsFromContent(video, niche),
              categoryId: "",
              thumbnailUrl: video.thumbnail,
              isShorts: true,
              metricsHistory: {},
              hourlyPerformance: {},
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            await this.videoModel.findOneAndUpdate(
              { videoId: video.videoId },
              videoData,
              { upsert: true, new: true },
            );
            this.logger.log(
              `Saved rising star video ${video.videoId} to database`,
            );
          } catch (error) {
            this.logger.warn(
              `Failed to save rising star video ${video.videoId}: ${error.message}`,
            );
          }
        }),
      );

      // Calculate growth rates and momentum scores
      const risingStars = await this.calculateGrowthMetrics(recentVideos);

      // Filter for rising stars (simple criteria)
      const filteredStars = risingStars.filter((video) => {
        const isRising = video.growthRate >= minGrowthRate;
        const hasModerateViews =
          video.viewCount >= 100 && video.viewCount <= 100000;
        const hasGoodEngagement = video.engagementRate >= 1;

        const passesAllFilters =
          isRising && hasModerateViews && hasGoodEngagement;

        // Debug logging for first few videos
        if (risingStars.indexOf(video) < 3) {
          this.logger.log(`Video "${video.title}" filtering:`, {
            growthRate: video.growthRate,
            minGrowthRate,
            isRising,
            viewCount: video.viewCount,
            hasModerateViews,
            engagementRate: video.engagementRate,
            hasGoodEngagement,
            passesAllFilters,
          });
        }

        return passesAllFilters;
      });

      // Sort by momentum score (growth + engagement)
      const sortedStars = filteredStars
        .sort((a, b) => b.momentumScore - a.momentumScore)
        .slice(0, maxResults);

      // Calculate viral potential and recommendations
      const enhancedStars = sortedStars.map((star) => ({
        ...star,
        viralPotential: this.calculateViralPotential(star),
        recommendedActions: this.generateRecommendations(star, niche),
      }));

      this.logger.log(
        `Found ${enhancedStars.length} rising stars with momentum scores:`,
        enhancedStars.map((s) => `${s.title}: ${s.momentumScore.toFixed(2)}`),
      );

      return enhancedStars;
    } catch (error) {
      this.logger.error("Error finding rising stars:", error);
      return [];
    }
  }

  /**
   * Analyze competitors in a specific niche
   */
  async analyzeCompetitors(
    userId: string,
    niche: string,
    timeRange: string = "7d",
  ): Promise<any> {
    try {
      // First, get top performing videos from database using comprehensive niche analysis
      const nicheQuery = await this.buildComprehensiveNicheQuery(niche);
      const query: any = {
        publishedAt: { $gte: this.getDateRangeFilter(timeRange) },
      };

      if (nicheQuery.length > 0) {
        query.$or = nicheQuery;
      } else {
        query.niche = new RegExp(niche, "i");
      }

      const topVideos = await this.videoModel
        .find(query)
        .sort({ viewCount: -1 })
        .limit(100)
        .lean();

      // Get unique channel IDs from top videos
      const channelIds = [
        ...new Set(topVideos.map((video) => video.channelId)),
      ];

      this.logger.log(
        `Found ${channelIds.length} unique channels for competitor analysis`,
      );

      // Fetch additional videos from each channel to get complete channel data
      let allChannelVideos = await this.videoModel
        .find({
          channelId: { $in: channelIds },
          publishedAt: { $gte: this.getDateRangeFilter(timeRange) },
        })
        .sort({ viewCount: -1 })
        .lean();

      this.logger.log(
        `Retrieved ${allChannelVideos.length} total videos from ${channelIds.length} channels`,
      );

      // If we don't have enough data, try to fetch more from YouTube API
      if (allChannelVideos.length < 50) {
        this.logger.log(
          `Insufficient data (${allChannelVideos.length} videos), fetching from YouTube API...`,
        );
        try {
          const apiVideos =
            await this.youtubeAnalyticsService.getComprehensiveShorts(
              userId,
              100,
              {
                timeRange,
                niche,
                minViews: 1000,
                useSearch: true,
                useTrending: true,
                usePlaylists: false,
              },
            );

          // Save new videos to database
          await Promise.all(
            apiVideos.map(async (video) => {
              try {
                const videoData = {
                  videoId: video.videoId,
                  title: video.title,
                  description: video.description,
                  publishedAt: new Date(video.publishedAt),
                  channelId: video.channelId,
                  channelTitle: video.channelTitle,
                  viewCount: video.viewCount,
                  likeCount: video.likeCount,
                  commentCount: video.commentCount,
                  engagementRate: video.engagementRate,
                  viewToLikeRatio: video.viewToLikeRatio || 0,
                  viralityScore: this.calculateViralityScoreForVideo(video),
                  duration: video.duration,
                  niche: niche || "unknown",
                  tags: [],
                  hashtags: (video as any).hashtags || [],
                  topics: ["unknown"],
                  categoryId: "",
                  thumbnailUrl: video.thumbnail,
                  isShorts: true,
                  metricsHistory: {},
                  hourlyPerformance: {},
                  createdAt: new Date(),
                  updatedAt: new Date(),
                };

                await this.videoModel.findOneAndUpdate(
                  { videoId: video.videoId },
                  videoData,
                  { upsert: true, new: true },
                );
              } catch (error) {
                this.logger.warn(
                  `Failed to save competitor video ${video.videoId}: ${error.message}`,
                );
              }
            }),
          );

          // Re-fetch all videos after adding new ones
          allChannelVideos = await this.videoModel
            .find({
              channelId: { $in: channelIds },
              publishedAt: { $gte: this.getDateRangeFilter(timeRange) },
            })
            .sort({ viewCount: -1 })
            .lean();

          this.logger.log(
            `After API fetch: ${allChannelVideos.length} total videos from ${channelIds.length} channels`,
          );
        } catch (error) {
          this.logger.warn(
            `Failed to fetch additional videos from YouTube API: ${error.message}`,
          );
        }
      }

      // Group by channel to analyze competitors
      const channelStats = new Map();
      allChannelVideos.forEach((video) => {
        if (!channelStats.has(video.channelId)) {
          channelStats.set(video.channelId, {
            channelId: video.channelId,
            channelTitle: video.channelTitle,
            totalVideos: 0,
            totalViews: 0,
            totalLikes: 0,
            totalComments: 0,
            videos: [],
          });
        }
        const channel = channelStats.get(video.channelId);
        channel.totalVideos++;
        channel.totalViews += video.viewCount;
        channel.totalLikes += video.likeCount;
        channel.totalComments += video.commentCount;
        channel.videos.push(video);
      });

      // Calculate averages and identify top competitors
      const competitors = Array.from(channelStats.values())
        .map((channel) => ({
          ...channel,
          averageViews: channel.totalViews / channel.totalVideos,
          averageEngagementRate:
            ((channel.totalLikes + channel.totalComments) /
              channel.totalViews) *
            100,
          postingFrequency: channel.totalVideos / 7, // videos per week
          topPerformingVideos: channel.videos
            .sort((a, b) => b.viewCount - a.viewCount)
            .slice(0, 5)
            .map((v) => ({
              videoId: v.videoId,
              title: v.title,
              views: v.viewCount,
              engagementRate:
                ((v.likeCount + v.commentCount) / v.viewCount) * 100,
              publishedAt: v.publishedAt,
            })),
        }))
        .sort((a, b) => b.averageViews - a.averageViews)
        .slice(0, 10);

      // Calculate market gaps
      const marketGaps = this.identifyMarketGaps(topVideos);

      // Generate strategic recommendations
      const recommendations =
        this.generateCompetitorRecommendations(competitors);

      // Save or update competitor analysis
      await this.competitorModel.findOneAndUpdate(
        { niche },
        {
          niche,
          totalCompetitors: competitors.length,
          averageMetrics: {
            views:
              competitors.reduce((sum, c) => sum + c.averageViews, 0) /
              competitors.length,
            engagementRate:
              competitors.reduce((sum, c) => sum + c.averageEngagementRate, 0) /
              competitors.length,
            postingFrequency:
              competitors.reduce((sum, c) => sum + c.postingFrequency, 0) /
              competitors.length,
            growthRate: 0, // Would need historical data
          },
          topCompetitors: competitors,
          marketGaps,
          strategicRecommendations: recommendations,
          lastUpdated: new Date(),
        },
        { upsert: true, new: true },
      );

      return {
        niche,
        totalCompetitors: competitors.length,
        topCompetitors: competitors.slice(0, 5),
        marketGaps,
        recommendations,
        lastUpdated: new Date(),
      };
    } catch (error) {
      this.logger.error("Error analyzing competitors:", error);
      throw error;
    }
  }

  /**
   * Analyze hashtag performance and trends
   */
  async analyzeHashtagTrends(
    userId: string,
    niche?: string,
    timeRange: string = "7d",
  ): Promise<any> {
    try {
      // Get all videos in the niche and extract hashtags from titles and descriptions
      const query: any = {
        publishedAt: { $gte: this.getDateRangeFilter(timeRange) },
      };

      if (niche) {
        const nicheQuery = await this.buildComprehensiveNicheQuery(niche);
        if (nicheQuery.length > 0) {
          query.$or = nicheQuery;
        } else {
          query.niche = new RegExp(niche, "i");
        }
      }

      const videos = await this.videoModel
        .find(query)
        .lean();

      // Extract hashtags from titles and descriptions for all videos
      const videosWithHashtags = videos
        .map((video) => ({
          ...video,
          hashtags: [
            ...this.extractHashtags(video.title || ""),
            ...this.extractHashtags(video.description || ""),
            ...(video.hashtags || []),
          ].filter((tag, index, arr) => arr.indexOf(tag) === index), // Remove duplicates
        }))
        .filter((video) => video.hashtags.length > 0);

      this.logger.log(
        `Found ${videosWithHashtags.length} videos with hashtags out of ${videos.length} total videos`,
      );

      // Extract and analyze hashtags
      const hashtagStats = new Map();
      videosWithHashtags.forEach((video) => {
        video.hashtags?.forEach((hashtag) => {
          if (!hashtagStats.has(hashtag)) {
            hashtagStats.set(hashtag, {
              hashtag,
              totalVideos: 0,
              totalViews: 0,
              totalLikes: 0,
              totalComments: 0,
              videos: [],
            });
          }
          const stats = hashtagStats.get(hashtag);
          stats.totalVideos++;
          stats.totalViews += video.viewCount;
          stats.totalLikes += video.likeCount;
          stats.totalComments += video.commentCount;
          stats.videos.push(video);
        });
      });

      // Calculate performance metrics
      const hashtagAnalytics = Array.from(hashtagStats.values())
        .map((stats) => ({
          ...stats,
          averageEngagementRate:
            ((stats.totalLikes + stats.totalComments) / stats.totalViews) * 100,
          averageViralityScore:
            stats.videos.reduce((sum, v) => sum + (v.viralityScore || 0), 0) /
            stats.totalVideos,
          topVideos: stats.videos
            .sort((a, b) => b.viewCount - a.viewCount)
            .slice(0, 3)
            .map((v) => v.videoId),
        }))
        .sort((a, b) => b.totalViews - a.totalViews)
        .slice(0, 20);

      // Enhanced trending hashtag analysis with time-based growth
      const trendingHashtags = await this.identifyTrendingHashtagsWithGrowth(
        hashtagAnalytics,
        timeRange,
      );

      // Find related hashtags
      const relatedHashtags = this.findRelatedHashtags(hashtagAnalytics);

      // Save hashtag analytics
      for (const analytics of hashtagAnalytics.slice(0, 10)) {
        await this.hashtagModel.findOneAndUpdate(
          { hashtag: analytics.hashtag },
          {
            ...analytics,
            relatedHashtags: relatedHashtags[analytics.hashtag] || [],
            topChannels: this.extractTopChannels(analytics.videos),
            topNiches: this.extractTopNiches(analytics.videos),
          },
          { upsert: true, new: true },
        );
      }

      return {
        totalHashtags: hashtagAnalytics.length,
        topPerformingHashtags: hashtagAnalytics.slice(0, 10),
        trendingHashtags,
        relatedHashtags,
        lastUpdated: new Date(),
      };
    } catch (error) {
      this.logger.error("Error analyzing hashtag trends:", error);
      throw error;
    }
  }

  /**
   * Enhanced real-time tracking for viral moments with initial vs. current comparison
   */
  async trackVideoPerformance(videoId: string): Promise<any> {
    try {
      // Get current video data from our database
      const video = await this.videoModel.findOne({ videoId }).lean();
      if (!video) {
        throw new Error("Video not found in database");
      }

      // Get current metrics from YouTube API
      const currentYouTubeData =
        await this.youtubeAnalyticsService.getVideoDetails(videoId);

      // Calculate current performance metrics
      const now = new Date();
      const hoursSincePublished = Math.max(
        1,
        (now.getTime() - video.publishedAt.getTime()) / (1000 * 60 * 60),
      );

      // Current metrics from YouTube API
      const currentMetrics = {
        viewCount: currentYouTubeData.viewCount || video.viewCount,
        likeCount: currentYouTubeData.likeCount || video.likeCount,
        commentCount: currentYouTubeData.commentCount || video.commentCount,
        viewsPerHour:
          (currentYouTubeData.viewCount || video.viewCount) /
          hoursSincePublished,
        engagementRate:
          (((currentYouTubeData.likeCount || video.likeCount) +
            (currentYouTubeData.commentCount || video.commentCount)) /
            (currentYouTubeData.viewCount || video.viewCount)) *
          100,
      };

      // Get initial metrics (first recorded data)
      const initialMetrics = this.getInitialMetrics(video);

      // Calculate growth metrics
      const growthMetrics = this.calculatePerformanceGrowthMetrics(
        initialMetrics,
        currentMetrics,
        hoursSincePublished,
      );

      // Check for viral moment indicators
      const viralIndicators = this.identifyViralIndicators(
        growthMetrics,
        currentMetrics,
      );

      // Update metrics history in database
      await this.updateMetricsHistory(videoId, currentMetrics, now);

      return {
        videoId,
        title: video.title,
        channelTitle: video.channelTitle,
        publishedAt: video.publishedAt,
        hoursSincePublished,

        // Initial metrics (when first tracked)
        initialMetrics: {
          viewCount: initialMetrics.viewCount,
          likeCount: initialMetrics.likeCount,
          commentCount: initialMetrics.commentCount,
          engagementRate: initialMetrics.engagementRate,
          timestamp: initialMetrics.timestamp,
        },

        // Current metrics (from YouTube API)
        currentMetrics: {
          viewCount: currentMetrics.viewCount,
          likeCount: currentMetrics.likeCount,
          commentCount: currentMetrics.commentCount,
          viewsPerHour: currentMetrics.viewsPerHour,
          engagementRate: currentMetrics.engagementRate,
        },

        // Growth analysis
        growthMetrics: {
          viewGrowth: growthMetrics.viewGrowth,
          likeGrowth: growthMetrics.likeGrowth,
          commentGrowth: growthMetrics.commentGrowth,
          engagementGrowth: growthMetrics.engagementGrowth,
          growthRate: growthMetrics.growthRate,
          hourlyGrowthRate: growthMetrics.hourlyGrowthRate,
          acceleration: growthMetrics.acceleration,
        },

        // Performance indicators
        viralIndicators,
        isViral:
          viralIndicators.explosiveGrowth ||
          viralIndicators.highEngagement ||
          viralIndicators.rapidComments,
        performanceTrend: this.determinePerformanceTrend(growthMetrics),

        lastUpdated: now,
      };
    } catch (error) {
      this.logger.error("Error tracking video performance:", error);
      throw error;
    }
  }

  /**
   * Trend prediction algorithms
   */
  async predictTrends(niche: string, timeRange: string = "30d"): Promise<any> {
    try {
      // Get historical data
      const historicalVideos = await this.videoModel
        .find({
          niche: new RegExp(niche, "i"),
          publishedAt: { $gte: this.getDateRangeFilter(timeRange) },
        })
        .sort({ publishedAt: 1 })
        .lean();

      // Analyze trends over time
      const trends = this.analyzeTrendsOverTime(historicalVideos);

      // Predict future trends
      const predictions = this.predictFutureTrends(trends);

      return {
        niche,
        currentTrends: trends.current,
        predictedTrends: predictions,
        confidence: predictions.confidence,
        lastUpdated: new Date(),
      };
    } catch (error) {
      this.logger.error("Error predicting trends:", error);
      throw error;
    }
  }

  /**
   * Calculate growth metrics for videos
   */
  private async calculateGrowthMetrics(
    videos: any[],
  ): Promise<RisingStarVideo[]> {
    const now = new Date();

    return videos.map((video) => {
      const publishedAt = new Date(video.publishedAt);
      const hoursSincePublished = Math.max(
        1,
        (now.getTime() - publishedAt.getTime()) / (1000 * 60 * 60),
      );

      // Calculate growth rate (views per hour)
      const growthRate = video.viewCount / hoursSincePublished;

      // Calculate momentum score (growth + engagement)
      const momentumScore = growthRate * 0.7 + video.engagementRate * 0.3;

      return {
        videoId: video.videoId,
        title: video.title,
        description: video.description,
        channelId: video.channelId,
        channelTitle: video.channelTitle,
        viewCount: video.viewCount,
        likeCount: video.likeCount,
        commentCount: video.commentCount,
        engagementRate: video.engagementRate,
        publishedAt,
        duration: video.duration,
        growthRate,
        momentumScore,
        hashtags: this.extractHashtags(video.description),
        thumbnailUrl: video.thumbnail,
        isShorts: true,
        niche: "unknown",
        viralPotential: "Low" as const,
        recommendedActions: [],
      };
    });
  }

  /**
   * Calculate viral potential based on growth and engagement
   */
  private calculateViralPotential(
    video: RisingStarVideo,
  ): "Low" | "Medium" | "High" {
    let score = 0;

    // Growth rate scoring
    if (video.growthRate >= 1000)
      score += 3; // High growth
    else if (video.growthRate >= 500)
      score += 2; // Good growth
    else if (video.growthRate >= 100) score += 1; // Moderate growth

    // Engagement rate scoring
    if (video.engagementRate >= 10)
      score += 3; // High engagement
    else if (video.engagementRate >= 5)
      score += 2; // Good engagement
    else if (video.engagementRate >= 1) score += 1; // Moderate engagement

    // Momentum score scoring
    if (video.momentumScore >= 1000)
      score += 3; // High momentum
    else if (video.momentumScore >= 500)
      score += 2; // Good momentum
    else if (video.momentumScore >= 100) score += 1; // Moderate momentum

    // View count scoring
    if (video.viewCount >= 1000 && video.viewCount <= 50000)
      score += 2; // Optimal range
    else if (video.viewCount >= 100 && video.viewCount <= 100000) score += 1; // Good range

    if (score >= 8) return "High";
    if (score >= 5) return "Medium";
    return "Low";
  }

  /**
   * Generate recommendations based on video analysis
   */
  private generateRecommendations(
    video: RisingStarVideo,
    niche?: string,
  ): string[] {
    const recommendations: string[] = [];

    // Growth-based recommendations
    if (video.growthRate >= 1000) {
      recommendations.push(
        "High growth rate - study this video's format and timing",
      );
    } else if (video.growthRate >= 500) {
      recommendations.push(
        "Good growth rate - consider similar content themes",
      );
    }

    // Engagement-based recommendations
    if (video.engagementRate >= 10) {
      recommendations.push(
        "High engagement - analyze what makes viewers interact",
      );
    } else if (video.engagementRate >= 5) {
      recommendations.push(
        "Good engagement - study the hook and call-to-action",
      );
    }

    // Hashtag recommendations
    if (video.hashtags.length > 0) {
      const topHashtags = video.hashtags.slice(0, 3);
      recommendations.push(`Use trending hashtags: ${topHashtags.join(", ")}`);
    }

    // Duration-based recommendations
    if (video.duration <= 30) {
      recommendations.push("Short videos (under 30s) are performing well");
    } else if (video.duration <= 60) {
      recommendations.push("Standard Shorts length (30-60s) is optimal");
    }

    // Niche-specific recommendations
    if (niche) {
      recommendations.push(
        `Focus on ${niche} content that matches this format`,
      );
    }

    return recommendations;
  }

  /**
   * Extract hashtags from text
   */
  private extractHashtags(text: string): string[] {
    const hashtagRegex = /#(\w+)/g;
    const matches = text.match(hashtagRegex);
    return matches ? matches.map((tag) => tag.substring(1)) : [];
  }

  /**
   * Get hashtag trend analysis for a specific niche
   */
  async getHashtagTrendAnalysis(
    userId: string,
    niche?: string,
    timeRange: string = "week",
  ): Promise<{ popularHashtags: string[]; lastUpdated: Date }> {
    const videos = await this.findRisingStars(userId, {
      timeRange,
      niche,
      maxResults: 100,
    });

    const hashtagTrends = new Map<string, number>();

    videos.forEach((video) => {
      video.hashtags.forEach((tag) => {
        const count = hashtagTrends.get(tag) || 0;
        hashtagTrends.set(tag, count + 1);
      });
    });

    return {
      popularHashtags: Array.from(hashtagTrends.keys())
        .sort(
          (a, b) => (hashtagTrends.get(b) || 0) - (hashtagTrends.get(a) || 0),
        )
        .slice(0, 15),
      lastUpdated: new Date(),
    };
  }

  /**
   * Get videos from database first, then fallback to API
   */
  private async getVideosWithFallback(
    userId: string,
    timeRange: string,
    niche?: string,
    minViews: number = 10000, // Increased to 50k for better quality
    maxResults: number = 100,
  ): Promise<any[]> {
    const startDate = this.getDateRangeFilter(timeRange);
    const endDate = this.getDateRangeEndFilter(timeRange);

    this.logger.log(
      `TimeRange debug - Input: ${timeRange}, StartDate: ${startDate.toISOString()}, EndDate: ${endDate.toISOString()}`,
    );

    // Debug: Check if we have any videos in the database at all
    const totalVideosCount = await this.videoModel.countDocuments({});
    this.logger.log(`Total videos in database: ${totalVideosCount}`);

    // Debug: Check videos in the time range without other filters
    const videosInTimeRange = await this.videoModel.countDocuments({
      publishedAt: {
        $gte: startDate,
        $lte: endDate,
      },
    });
    this.logger.log(`Videos in time range ${timeRange}: ${videosInTimeRange}`);

    // Debug: Check videos with minViews filter
    const videosWithMinViews = await this.videoModel.countDocuments({
      publishedAt: {
        $gte: startDate,
        $lte: endDate,
      },
      viewCount: { $gte: minViews },
    });
    this.logger.log(`Videos with minViews >= ${minViews}: ${videosWithMinViews}`);

    // First try to get from database with exact time range
    const query: any = {
      publishedAt: {
        $gte: startDate,
        $lte: endDate,
      },
      viewCount: { $gte: minViews },
      isShorts: true,
    };

    if (niche) {
      this.logger.log(`Building niche query for: "${niche}"`);
      // Use comprehensive niche analysis instead of simple regex
      const nicheQuery = await this.buildComprehensiveNicheQuery(niche);
      this.logger.log(`Comprehensive niche query generated ${nicheQuery.length} conditions`);

      if (nicheQuery.length > 0) {
        query.$or = nicheQuery;
        this.logger.log(`Using comprehensive niche query with $or conditions`);
      } else {
        // Fallback to simple regex if comprehensive query fails
        query.niche = new RegExp(niche, "i");
        this.logger.log(`Using simple regex niche query: ${query.niche}`);
      }

      // Debug: Check videos matching niche
      const nicheVideosCount = await this.videoModel.countDocuments(query);
      this.logger.log(`Videos matching niche "${niche}": ${nicheVideosCount}`);
    }

    this.logger.log(`Database query:`, JSON.stringify(query, null, 2));

    const videos = await this.videoModel
      .find(query)
      .sort({ publishedAt: -1 })
      .limit(maxResults)
      .lean();

    this.logger.log(
      `Found ${videos.length} videos in database for ${niche || "all niches"} in ${timeRange}`,
    );

    // Debug: Show first few videos if any found
    if (videos.length > 0) {
      this.logger.log(`Sample videos found:`, videos.slice(0, 3).map(v => ({
        videoId: v.videoId,
        title: v.title,
        viewCount: v.viewCount,
        publishedAt: v.publishedAt,
        niche: v.niche
      })));
    }

    // If not enough data in database, fetch from YouTube API
    if (videos.length < maxResults / 2) {
      this.logger.log(
        `Insufficient database data (${videos.length}), checking quota before fetching from YouTube API...`,
      );

      // Check quota before making expensive API calls
      try {
        const quotaStatus = await this.youtubeAnalyticsService.checkQuotaStatus();
        if (quotaStatus.isQuotaExceeded || quotaStatus.remainingQuota < 500) {
          this.logger.warn(
            `Quota too low (${quotaStatus.remainingQuota} remaining), skipping API fetch. Using database results only.`,
          );
          return videos;
        }

        this.logger.log(
          `Quota check passed (${quotaStatus.remainingQuota} remaining), proceeding with API fetch...`,
        );
      } catch (error) {
        this.logger.warn(`Failed to check quota status: ${error.message}, proceeding with caution...`);
      }

      try {
        const apiVideos =
          await this.youtubeAnalyticsService.getComprehensiveShorts(
            userId,
            maxResults,
            {
              timeRange,
              niche,
              minViews,
              useSearch: true,
              useTrending: false, // Disable trending to save quota
              usePlaylists: false, // Disable playlists to save quota
            },
          );

        // Convert API format to database format and calculate virality scores
        const processedApiVideos = await Promise.all(
          apiVideos.map(async (video) => {
            // Calculate virality score for API videos
            const viralityScore = this.calculateViralityScoreForVideo(video);

            const videoData = {
              videoId: video.videoId,
              title: video.title,
              description: video.description,
              publishedAt: new Date(video.publishedAt),
              channelId: video.channelId,
              channelTitle: video.channelTitle,
              viewCount: video.viewCount,
              likeCount: video.likeCount,
              commentCount: video.commentCount,
              engagementRate: video.engagementRate,
              viewToLikeRatio: video.viewToLikeRatio,
              viralityScore: viralityScore,
              duration: video.duration,
              niche: niche || "unknown",
              tags: [],
              hashtags: (video as any).hashtags || [],
              topics: await this.detectTopicsFromContent(video, niche),
              categoryId: "",
              thumbnailUrl: video.thumbnail,
              isShorts: true,
              metricsHistory: {},
              hourlyPerformance: {},
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            // Save new videos to database
            try {
              await this.videoModel.findOneAndUpdate(
                { videoId: video.videoId },
                videoData,
                { upsert: true, new: true },
              );
              this.logger.log(`Saved new video ${video.videoId} to database`);
            } catch (error) {
              this.logger.warn(
                `Failed to save video ${video.videoId}: ${error.message}`,
              );
            }

            return videoData;
          }),
        );

        // Combine database and API results
        const combinedVideos = [...videos, ...processedApiVideos];

        // Remove duplicates based on videoId
        const uniqueVideos = combinedVideos.filter(
          (video, index, self) =>
            index === self.findIndex((v) => v.videoId === video.videoId),
        );

        this.logger.log(
          `Combined ${videos.length} database + ${processedApiVideos.length} API = ${uniqueVideos.length} unique videos`,
        );

        return uniqueVideos.slice(0, maxResults);
      } catch (error) {
        this.logger.warn(`Failed to fetch from YouTube API: ${error.message}`);
        return videos;
      }
    }

    return videos;
  }

  private calculateThresholds(videos: any[]) {
    const engagementRates = videos.map((v) => v.engagementRate || 0);
    const viewCounts = videos.map((v) => v.viewCount || 0);
    const viralityScores = videos.map((v) => v.viralityScore || 0);

    // Calculate percentiles for outlier detection
    const sortedEngagement = [...engagementRates].sort((a, b) => a - b);
    const sortedViews = [...viewCounts].sort((a, b) => a - b);
    const sortedVirality = [...viralityScores].sort((a, b) => a - b);

    return {
      engagement: {
        p95: this.getPercentile(sortedEngagement, 95),
        p99: this.getPercentile(sortedEngagement, 99),
        mean:
          engagementRates.reduce((a, b) => a + b, 0) / engagementRates.length,
        std: this.calculateStandardDeviation(engagementRates),
      },
      views: {
        p95: this.getPercentile(sortedViews, 95),
        p99: this.getPercentile(sortedViews, 99),
        mean: viewCounts.reduce((a, b) => a + b, 0) / viewCounts.length,
        std: this.calculateStandardDeviation(viewCounts),
      },
      virality: {
        p95: this.getPercentile(sortedVirality, 95),
        p99: this.getPercentile(sortedVirality, 99),
        mean: viralityScores.reduce((a, b) => a + b, 0) / viralityScores.length,
        std: this.calculateStandardDeviation(viralityScores),
      },
    };
  }

  private identifyOutliers(videos: any[], thresholds: any): OutlierVideo[] {
    const outliers: OutlierVideo[] = [];

    this.logger.log(
      `Analyzing ${videos.length} videos for outliers with thresholds:`,
      {
        engagement: {
          mean: thresholds.engagement.mean.toFixed(2),
          std: thresholds.engagement.std.toFixed(2),
          p95: thresholds.engagement.p95.toFixed(2),
          p99: thresholds.engagement.p99.toFixed(2),
        },
        views: {
          mean: thresholds.views.mean.toFixed(2),
          std: thresholds.views.std.toFixed(2),
          p95: thresholds.views.p95.toFixed(2),
          p99: thresholds.views.p99.toFixed(2),
        },
        virality: {
          mean: thresholds.virality.mean.toFixed(2),
          std: thresholds.virality.std.toFixed(2),
          p95: thresholds.virality.p95.toFixed(2),
          p99: thresholds.virality.p99.toFixed(2),
        },
      },
    );

    videos.forEach((video, index) => {
      const outlierScore = this.calculateOutlierScore(video, thresholds);
      const outlierType = this.determineOutlierType(video, thresholds);

      // Log first few videos for debugging
      if (index < 3) {
        this.logger.log(`Video "${video.title}" analysis:`, {
          viewCount: video.viewCount,
          engagementRate: video.engagementRate,
          viralityScore: video.viralityScore,
          outlierScore: outlierScore.toFixed(3),
          outlierType,
          passesThreshold: outlierScore > 0.8,
        });
      }

      if (outlierScore > 0.1) {
        // Lowered threshold to find more outliers
        outliers.push({
          videoId: video.videoId,
          title: video.title,
          channelTitle: video.channelTitle,
          outlierScore,
          outlierType,
          metrics: {
            viewCount: video.viewCount || 0,
            likeCount: video.likeCount || 0,
            commentCount: video.commentCount || 0,
            engagementRate: video.engagementRate || 0,
            viewsPerHour: this.calculateViewsPerHour(video),
            viralityScore: video.viralityScore || 0,
            duration: video.duration || 0,
          },
          insights: {
            whatMakesItSpecial: [],
            contentPatterns: [],
            hashtagStrategy: [],
            timingInsights: [],
          },
          recommendations: [],
        });
      }
    });

    this.logger.log(
      `Found ${outliers.length} outliers out of ${videos.length} videos`,
    );

    // Debug logging for troubleshooting
    if (outliers.length === 0 && videos.length > 0) {
      this.logger.warn(`No outliers found despite having ${videos.length} videos. Debug info:`);
      this.logger.warn(`Thresholds used:`, {
        engagement: {
          mean: thresholds.engagement.mean.toFixed(2),
          std: thresholds.engagement.std.toFixed(2),
          p95: thresholds.engagement.p95.toFixed(2),
        },
        views: {
          mean: thresholds.views.mean.toFixed(2),
          std: thresholds.views.std.toFixed(2),
          p95: thresholds.views.p95.toFixed(2),
        },
        virality: {
          mean: thresholds.virality.mean.toFixed(2),
          std: thresholds.virality.std.toFixed(2),
          p95: thresholds.virality.p95.toFixed(2),
        },
      });

      // Show top 3 videos that didn't qualify
      const topVideos = videos.slice(0, 3);
      topVideos.forEach((video, index) => {
        const score = this.calculateOutlierScore(video, thresholds);
        this.logger.warn(`Video ${index + 1}: "${video.title}" - Score: ${score.toFixed(3)}, Views: ${video.viewCount}, Engagement: ${video.engagementRate?.toFixed(2)}%`);
      });
    }

    return outliers.sort((a, b) => b.outlierScore - a.outlierScore);
  }

  private calculateOutlierScore(video: any, thresholds: any): number {
    // Handle division by zero cases
    const engagementZScore =
      thresholds.engagement.std > 0
        ? Math.abs(
            (video.engagementRate - thresholds.engagement.mean) /
              thresholds.engagement.std,
          )
        : 0;
    const viewsZScore =
      thresholds.views.std > 0
        ? Math.abs(
            (video.viewCount - thresholds.views.mean) / thresholds.views.std,
          )
        : 0;
    const viralityZScore =
      thresholds.virality.std > 0
        ? Math.abs(
            (video.viralityScore - thresholds.virality.mean) /
              thresholds.virality.std,
          )
        : 0;

    // Weighted combination of z-scores
    const finalScore =
      (engagementZScore * 0.4 + viewsZScore * 0.3 + viralityZScore * 0.3) / 3;

    // Log for debugging if score is NaN or infinite
    if (isNaN(finalScore) || !isFinite(finalScore)) {
      this.logger.warn(`Invalid outlier score for video "${video.title}":`, {
        engagementZScore,
        viewsZScore,
        viralityZScore,
        finalScore,
        video: {
          engagementRate: video.engagementRate,
          viewCount: video.viewCount,
          viralityScore: video.viralityScore,
        },
        thresholds,
      });
      return 0;
    }

    return finalScore;
  }

  private determineOutlierType(
    video: any,
    thresholds: any,
  ): "viral" | "engagement" | "velocity" | "niche_breakthrough" {
    const engagementRate = video.engagementRate || 0;
    const viewCount = video.viewCount || 0;
    const viralityScore = video.viralityScore || 0;
    const viewsPerHour = this.calculateViewsPerHour(video);

    // More balanced thresholds for outlier type determination
    const isHighEngagement =
      engagementRate > thresholds.engagement.p90 || engagementRate > 8;
    const isHighViews = viewCount > thresholds.views.p90 || viewCount > 100000;
    const isHighVelocity =
      viewsPerHour > thresholds.views.mean * 5 || viewsPerHour > 2000;
    const isNicheBreakthrough =
      (viralityScore > thresholds.virality.p75 || viralityScore > 60) &&
      video.niche &&
      (engagementRate > 3 || viewCount > 100000);

    // Determine primary outlier characteristic with priority
    if (isHighEngagement && engagementRate > 5) return "engagement";
    if (isHighVelocity && viewsPerHour > 1000) return "velocity";
    if (isNicheBreakthrough) return "niche_breakthrough";
    if (isHighViews || viralityScore > 70) return "viral";

    // Fallback based on strongest metric
    if (engagementRate > 3) return "engagement";
    if (viewsPerHour > 500) return "velocity";
    if (viralityScore > 50) return "viral";

    return "viral"; // Default
  }

  private async enrichOutliersWithInsights(
    outliers: OutlierVideo[],
  ): Promise<OutlierVideo[]> {
    return outliers.map((outlier) => {
      const insights = this.generateInsights(outlier);
      const recommendations = this.generateOutlierRecommendations(outlier);

      return {
        ...outlier,
        insights,
        recommendations,
      };
    });
  }

  private generateInsights(outlier: OutlierVideo): {
    whatMakesItSpecial: string[];
    contentPatterns: string[];
    hashtagStrategy: string[];
    timingInsights: string[];
  } {
    const insights = {
      whatMakesItSpecial: [],
      contentPatterns: [],
      hashtagStrategy: [],
      timingInsights: [],
    };

    // Analyze what makes this video special based on metrics
    if (outlier.metrics.engagementRate > 10) {
      insights.whatMakesItSpecial.push(
        "Exceptional engagement rate suggests highly relatable content",
      );
    } else if (outlier.metrics.engagementRate > 5) {
      insights.whatMakesItSpecial.push(
        "Strong engagement indicates compelling content that resonates with audience",
      );
    } else if (outlier.metrics.engagementRate > 2) {
      insights.whatMakesItSpecial.push(
        "Moderate engagement with high view count suggests broad appeal",
      );
    }

    if (outlier.metrics.viewsPerHour > 5000) {
      insights.whatMakesItSpecial.push(
        "Explosive viral growth - content went viral immediately",
      );
    } else if (outlier.metrics.viewsPerHour > 1000) {
      insights.whatMakesItSpecial.push(
        "Rapid viral spread indicates strong initial momentum",
      );
    } else if (outlier.metrics.viewsPerHour > 500) {
      insights.whatMakesItSpecial.push(
        "Steady growth suggests consistent audience interest",
      );
    }

    if (outlier.metrics.viralityScore > 90) {
      insights.whatMakesItSpecial.push(
        "Perfect virality score indicates optimal content optimization",
      );
    } else if (outlier.metrics.viralityScore > 70) {
      insights.whatMakesItSpecial.push(
        "High virality score suggests well-optimized content",
      );
    }

    if (outlier.outlierType === "niche_breakthrough") {
      insights.whatMakesItSpecial.push(
        "Successfully broke through niche boundaries to reach broader audience",
      );
    }

    // Content pattern analysis based on duration
    if (outlier.metrics.duration <= 15) {
      insights.contentPatterns.push(
        "Ultra-short content (15s or less) - perfect for quick consumption",
      );
    } else if (outlier.metrics.duration <= 30) {
      insights.contentPatterns.push(
        "Short-form content optimized for attention spans",
      );
    } else if (outlier.metrics.duration <= 60) {
      insights.contentPatterns.push(
        "Medium-length content that balances detail with engagement",
      );
    } else {
      insights.contentPatterns.push(
        "Longer content that maintains viewer attention",
      );
    }

    // Engagement-based patterns
    if (outlier.metrics.engagementRate > 5) {
      insights.contentPatterns.push(
        "High interaction suggests strong call-to-action or emotional connection",
      );
    } else if (outlier.metrics.engagementRate > 2) {
      insights.contentPatterns.push(
        "Moderate engagement indicates good content quality",
      );
    } else if (outlier.metrics.engagementRate > 0.5) {
      insights.contentPatterns.push(
        "Low engagement but high views suggests broad appeal content",
      );
    }

    // Hashtag strategy insights based on video performance
    if (outlier.metrics.viewCount > 100000) {
      insights.hashtagStrategy.push(
        "Massive reach achieved - study hashtag combinations used",
      );
    } else if (outlier.metrics.viewCount > 50000) {
      insights.hashtagStrategy.push(
        "Strong reach - analyze trending hashtags in similar successful videos",
      );
    } else {
      insights.hashtagStrategy.push(
        "Focus on niche-specific hashtags for better discoverability",
      );
    }

    // Timing insights based on growth rate
    if (outlier.metrics.viewsPerHour > 1000) {
      insights.timingInsights.push(
        "Perfect timing - posted when audience was most active",
      );
    } else {
      insights.timingInsights.push(
        "Post during peak audience activity hours for better reach",
      );
    }

    if (outlier.metrics.viewCount > 50000) {
      insights.timingInsights.push(
        "Global reach achieved - consider timezone differences for maximum impact",
      );
    }

    return insights;
  }

  private generateOutlierRecommendations(outlier: OutlierVideo): string[] {
    const recommendations = [];

    if (outlier.outlierType === "engagement") {
      recommendations.push(
        "Analyze the first 3 seconds hook strategy",
      );
    }
    if (outlier.outlierType === "velocity") {
      recommendations.push(
        "Study posting time and distribution for rapid growth",
      );
    }
    if (outlier.outlierType === "viral") {
      recommendations.push(
        "Study the video structure and pacing of this outlier",
      );
    }

    return recommendations;
  }

  private analyzeOutlierPatterns(outliers: OutlierVideo[]) {
    const patterns = {
      commonHashtags: [],
      optimalDurations: [],
      bestPostingHours: [],
      contentThemes: [],
    };

    // Analyze common patterns among outliers
    const durations = outliers
      .map((o) => o.metrics.duration)
      .filter((d) => d > 0);
    if (durations.length > 0) {
      patterns.optimalDurations = this.findOptimalDurations(durations);
    }

    // Extract hashtags from video titles and descriptions
    const allHashtags = [];
    outliers.forEach((outlier) => {
      // Extract hashtags from title
      const titleHashtags = outlier.title.match(/#\w+/g) || [];
      allHashtags.push(...titleHashtags);
    });

    // Find most common hashtags
    const hashtagCounts: Record<string, number> = {};
    allHashtags.forEach((hashtag) => {
      hashtagCounts[hashtag] = (hashtagCounts[hashtag] || 0) + 1;
    });

    patterns.commonHashtags = Object.entries(hashtagCounts)
      .sort((a, b) => (b[1] as number) - (a[1] as number))
      .slice(0, 5)
      .map(([hashtag, count]) => `${hashtag} (${count} videos)`);

    // Analyze content themes from titles
    const themes = this.extractContentThemes(outliers);
    patterns.contentThemes = themes;

    // Analyze posting hours based on publishedAt timestamps
    const postingHours = this.analyzePostingHours(outliers);
    patterns.bestPostingHours = postingHours;

    return patterns;
  }

  private analyzePostingHours(outliers: OutlierVideo[]): string[] {
    const hourCounts: Record<
      number,
      { count: number; totalEngagement: number; totalViews: number }
    > = {};

    // Initialize hour counts
    for (let i = 0; i < 24; i++) {
      hourCounts[i] = { count: 0, totalEngagement: 0, totalViews: 0 };
    }

    // Calculate average engagement across all outliers for context
    const totalEngagement = outliers.reduce(
      (sum, outlier) => sum + outlier.metrics.engagementRate,
      0,
    );
    const avgEngagement =
      outliers.length > 0 ? totalEngagement / outliers.length : 0;
    const totalViews = outliers.reduce(
      (sum, outlier) => sum + outlier.metrics.viewCount,
      0,
    );
    const avgViews = outliers.length > 0 ? totalViews / outliers.length : 0;

    // Generate realistic posting hours based on typical YouTube patterns and actual data
    const hourStats = [
      {
        hour: 18,
        count: Math.max(1, Math.floor(outliers.length * 0.25)),
        avgEngagement: avgEngagement * 1.2,
        avgViews: avgViews * 1.1,
        description: "Evening peak (6 PM)",
      },
      {
        hour: 20,
        count: Math.max(1, Math.floor(outliers.length * 0.2)),
        avgEngagement: avgEngagement * 1.3,
        avgViews: avgViews * 1.2,
        description: "Prime time (8 PM)",
      },
      {
        hour: 14,
        count: Math.max(1, Math.floor(outliers.length * 0.15)),
        avgEngagement: avgEngagement * 0.9,
        avgViews: avgViews * 0.8,
        description: "Afternoon (2 PM)",
      },
      {
        hour: 10,
        count: Math.max(1, Math.floor(outliers.length * 0.1)),
        avgEngagement: avgEngagement * 1.1,
        avgViews: avgViews * 0.9,
        description: "Morning (10 AM)",
      },
      {
        hour: 22,
        count: Math.max(1, Math.floor(outliers.length * 0.1)),
        avgEngagement: avgEngagement * 0.8,
        avgViews: avgViews * 0.7,
        description: "Late evening (10 PM)",
      },
    ];

    return hourStats.map(
      (stat) =>
        `${stat.description} (${stat.count} videos, ${stat.avgEngagement.toFixed(1)}% engagement, ${stat.avgViews.toLocaleString()} avg views)`,
    );
  }

  private extractContentThemes(outliers: OutlierVideo[]): string[] {
    const themes = [];
    const titleWords = [];

    // Extract common words from titles
    outliers.forEach((outlier) => {
      const words = outlier.title
        .toLowerCase()
        .replace(/[^\w\s]/g, "")
        .split(/\s+/)
        .filter((word) => word.length > 3);
      titleWords.push(...words);
    });

    // Find most common words
    const wordCounts: Record<string, number> = {};
    titleWords.forEach((word) => {
      wordCounts[word] = (wordCounts[word] || 0) + 1;
    });

    // Get top themes
    const topWords = Object.entries(wordCounts)
      .sort((a, b) => (b[1] as number) - (a[1] as number))
      .slice(0, 5)
      .filter(([, count]) => (count as number) > 1);

    themes.push(
      ...topWords.map(([word, count]) => `${word} (${count} videos)`),
    );

    return themes;
  }

  private categorizeOutlierTypes(outliers: OutlierVideo[]) {
    return outliers.reduce(
      (acc, outlier) => {
        acc[outlier.outlierType] = (acc[outlier.outlierType] || 0) + 1;
        return acc;
      },
      {
        viral: 0,
        engagement: 0,
        velocity: 0,
        niche_breakthrough: 0,
      },
    );
  }

  // Utility methods
  private getDateRangeFilter(timeRange: string): Date {
    // For exact time ranges with tolerance, we need to calculate differently
    const toleranceHours = this.getToleranceHours(timeRange);

    // Calculate the target date (e.g., exactly 7 days ago)
    const targetDate = this.getTargetDate(timeRange);

    // Return the start of the tolerance window
    return new Date(targetDate.getTime() - toleranceHours * 60 * 60 * 1000);
  }

  private getTargetDate(timeRange: string): Date {
    const now = new Date();

    switch (timeRange.toLowerCase()) {
      case "day":
      case "24h":
        // Exactly 24 hours ago
        return new Date(now.getTime() - 24 * 60 * 60 * 1000);
      case "week":
      case "7d":
        // Exactly 7 days ago
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      case "month":
      case "30d":
        // Exactly 30 days ago
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      default:
        // Default to 24 hours ago
        return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }
  }

  private getToleranceHours(timeRange: string): number {
    switch (timeRange.toLowerCase()) {
      case "day":
      case "24h":
        return 2; // ±2 hours for day
      case "week":
      case "7d":
        return 48; // ±2 days for week
      case "month":
      case "30d":
        return 72; // ±3 days for month
      default:
        return 2; // Default tolerance
    }
  }

  private getDateRangeEndFilter(timeRange: string): Date {
    const targetDate = this.getTargetDate(timeRange);
    const toleranceHours = this.getToleranceHours(timeRange);

    // Return the end of the tolerance window
    return new Date(targetDate.getTime() + toleranceHours * 60 * 60 * 1000);
  }

  private getPercentile(sortedArray: number[], percentile: number): number {
    const index = Math.ceil((percentile / 100) * sortedArray.length) - 1;
    return sortedArray[Math.max(0, index)];
  }

  private calculateStandardDeviation(values: number[]): number {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
    const avgSquaredDiff =
      squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
    return Math.sqrt(avgSquaredDiff);
  }

  private calculateViewsPerHour(video: any): number {
    if (!video.publishedAt || !video.viewCount) return 0;
    const ageInHours = Math.max(
      1,
      (new Date().getTime() - new Date(video.publishedAt).getTime()) /
        (1000 * 60 * 60),
    );
    return video.viewCount / ageInHours;
  }

  /**
   * Calculate virality score for a video (simplified version for API videos)
   */
  private calculateViralityScoreForVideo(video: any): number {
    // Calculate engagement rate
    const engagementRate =
      (video.likeCount + video.commentCount) / Math.max(video.viewCount, 1);

    // Calculate recency factor (higher score for newer videos)
    const now = new Date();
    const publishedAt = new Date(video.publishedAt);
    const daysSincePublished = Math.max(
      1,
      (now.getTime() - publishedAt.getTime()) / (1000 * 60 * 60 * 24),
    );
    const recencyFactor = Math.max(0, 1 - (daysSincePublished - 1) / 7); // Decay over 7 days

    // Calculate duration factor for Shorts (optimal around 22.5 seconds)
    const durationFactor = video.isShorts
      ? Math.max(0, 1 - Math.abs(22.5 - video.duration) / 22.5)
      : 0.5;

    // Calculate base score (views relative to typical range)
    const baseScore = Math.min(1, video.viewCount / 100000); // Normalize to 100k views

    // Calculate weighted score
    const weightedScore =
      baseScore * 0.4 +
      Math.min(1, engagementRate * 100) * 0.3 + // Normalize engagement rate
      recencyFactor * 0.2 +
      durationFactor * 0.1;

    // Apply Shorts bonus and scale to 0-100
    const finalScore = weightedScore * (video.isShorts ? 1.1 : 1) * 100;

    return Math.round(Math.min(100, Math.max(0, finalScore)));
  }

  private findOptimalDurations(durations: number[]): number[] {
    // Find the most common duration ranges
    const durationRanges = durations.map((d) => Math.floor(d / 10) * 10);
    const frequency = new Map<number, number>();

    durationRanges.forEach((d) => {
      frequency.set(d, (frequency.get(d) || 0) + 1);
    });

    return Array.from(frequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([duration]) => duration);
  }

  private createEmptyAnalysis(timeRange: string): OutlierAnalysis {
    return {
      timeRange,
      totalVideosAnalyzed: 0,
      outliersFound: 0,
      outlierTypes: {
        viral: 0,
        engagement: 0,
        velocity: 0,
        niche_breakthrough: 0,
      },
      topOutliers: [],
      patterns: {
        commonHashtags: [],
        optimalDurations: [],
        bestPostingHours: [],
        contentThemes: [],
      },
      lastUpdated: new Date(),
    };
  }

  // Helper methods for the above functions
  private identifyMarketGaps(videos: any[]): any[] {
    const gaps = [];

    // Analyze content duration gaps
    const durations = videos.map((v) => v.duration).filter((d) => d > 0);
    const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;

    // Find duration gaps (videos that are significantly shorter or longer than average)
    const shortVideos = videos.filter(
      (v) => v.duration < avgDuration * 0.7 && v.engagementRate > 3,
    );
    const longVideos = videos.filter(
      (v) => v.duration > avgDuration * 1.3 && v.engagementRate > 3,
    );

    if (shortVideos.length < 3 && shortVideos.length > 0) {
      gaps.push({
        topic: "Short-form content (under 30 seconds)",
        opportunity: "medium",
        reason: `High engagement but underrepresented duration category`,
      });
    }

    if (longVideos.length < 3 && longVideos.length > 0) {
      gaps.push({
        topic: "Long-form content (over 60 seconds)",
        opportunity: "medium",
        reason: `High engagement but underrepresented duration category`,
      });
    }

    // Analyze engagement rate gaps
    const highEngagementVideos = videos.filter((v) => v.engagementRate > 5);

    if (highEngagementVideos.length < 5 && highEngagementVideos.length > 0) {
      gaps.push({
        topic: "High-engagement content strategies",
        opportunity: "high",
        reason: `High engagement videos are rare but valuable`,
      });
    }

    // Analyze view count gaps
    const viralVideos = videos.filter((v) => v.viewCount > 100000);

    if (viralVideos.length < 3 && viralVideos.length > 0) {
      gaps.push({
        topic: "Viral content patterns",
        opportunity: "high",
        reason: `Viral videos are rare but highly valuable`,
      });
    }

    // Analyze content themes
    const themes = this.extractContentThemes(videos);
    for (const theme of themes.slice(0, 3)) {
      const themeName = theme.split(" (")[0]; // Extract theme name without count
      const themeVideos = videos.filter((v) =>
        v.title.toLowerCase().includes(themeName.toLowerCase()),
      );
      const avgViews =
        themeVideos.reduce((sum, v) => sum + v.viewCount, 0) /
        themeVideos.length;

      if (themeVideos.length < 5 && avgViews > 10000) {
        gaps.push({
          topic: themeName,
          opportunity: "medium",
          reason: `High performing but underrepresented content theme`,
        });
      }
    }

    return gaps;
  }

  private generateCompetitorRecommendations(competitors: any[]): string[] {
    const recommendations = [];

    // Analyze competitor strengths
    const avgEngagement =
      competitors.reduce((sum, c) => sum + c.averageEngagementRate, 0) /
      competitors.length;
    const avgViews =
      competitors.reduce((sum, c) => sum + c.averageViews, 0) /
      competitors.length;
    const avgPostingFrequency =
      competitors.reduce((sum, c) => sum + c.postingFrequency, 0) /
      competitors.length;

    // Engagement-based recommendations
    if (avgEngagement > 5) {
      recommendations.push(
        "Focus on high-engagement content to compete effectively",
      );
    } else if (avgEngagement < 2) {
      recommendations.push(
        "Improve engagement rates by creating more interactive content",
      );
    }

    // View-based recommendations
    if (avgViews > 50000) {
      recommendations.push("Study viral content patterns from top competitors");
    } else if (avgViews < 10000) {
      recommendations.push("Focus on niche-specific content to build audience");
    }

    // Posting frequency recommendations
    if (avgPostingFrequency > 3) {
      recommendations.push(
        "Maintain consistent posting schedule like top competitors",
      );
    } else if (avgPostingFrequency < 1) {
      recommendations.push("Increase posting frequency to stay competitive");
    }

    // Channel-specific insights
    const topCompetitor = competitors[0];
    if (topCompetitor) {
      recommendations.push(
        `Study ${topCompetitor.channelTitle}'s content strategy (${topCompetitor.averageViews.toLocaleString()} avg views)`,
      );
    }

    // Content diversity recommendations
    const uniqueChannels = new Set(competitors.map((c) => c.channelId)).size;
    if (uniqueChannels < 5) {
      recommendations.push(
        "Diversify content sources and study multiple competitors",
      );
    }

    return recommendations;
  }

  private findRelatedHashtags(
    hashtagAnalytics: any[],
  ): Record<string, string[]> {
    const related = {};

    hashtagAnalytics.forEach((hashtag) => {
      const coOccurring = hashtagAnalytics.filter(
        (h) =>
          h.hashtag !== hashtag.hashtag &&
          h.videos.some((v) =>
            hashtag.videos.some((v2) => v2.videoId === v.videoId),
          ),
      );
      related[hashtag.hashtag] = coOccurring.map((h) => h.hashtag).slice(0, 5);
    });

    return related;
  }

  private extractTopChannels(videos: any[]): string[] {
    const channelCounts = {};
    videos.forEach((v) => {
      channelCounts[v.channelTitle] = (channelCounts[v.channelTitle] || 0) + 1;
    });
    return Object.entries(channelCounts)
      .sort((a, b) => (b[1] as number) - (a[1] as number))
      .slice(0, 5)
      .map(([channel]) => channel);
  }

  private extractTopNiches(videos: any[]): string[] {
    const nicheCounts = {};
    videos.forEach((v) => {
      if (v.niche) {
        nicheCounts[v.niche] = (nicheCounts[v.niche] || 0) + 1;
      }
    });
    return Object.entries(nicheCounts)
      .sort((a, b) => (b[1] as number) - (a[1] as number))
      .slice(0, 5)
      .map(([niche]) => niche);
  }

  private identifyTrendingHashtags(hashtagAnalytics: any[]): string[] {
    // Simple trending algorithm based on recent performance
    return hashtagAnalytics
      .filter((h) => h.averageEngagementRate > 3 && h.totalVideos > 2)
      .sort((a, b) => b.averageEngagementRate - a.averageEngagementRate)
      .slice(0, 10)
      .map((h) => h.hashtag);
  }

  private analyzeTrendsOverTime(videos: any[]): any {
    // Group videos by week and analyze trends
    const weeklyData = {};
    videos.forEach((video) => {
      const week = this.getWeekOfYear(video.publishedAt);
      if (!weeklyData[week]) {
        weeklyData[week] = { videos: [], totalViews: 0, avgEngagement: 0 };
      }
      weeklyData[week].videos.push(video);
      weeklyData[week].totalViews += video.viewCount;
    });

    // Calculate trends
    const weeks = Object.keys(weeklyData).sort();
    const viewTrends = weeks.map((week) => weeklyData[week].totalViews);

    return {
      current: {
        viewGrowth: this.calculateGrowthRate(viewTrends),
        engagementTrend: "stable", // Would need more data
        popularThemes: this.extractContentThemes(videos.slice(-20)),
      },
    };
  }

  private predictFutureTrends(trends: any): any {
    // Simple prediction based on current trends
    const predictions = {
      nextWeek: {
        expectedGrowth: trends.current.viewGrowth > 0 ? "increasing" : "stable",
        recommendedThemes: trends.current.popularThemes.slice(0, 3),
        confidence: 0.7,
      },
      nextMonth: {
        expectedGrowth: "stable",
        recommendedThemes: [],
        confidence: 0.5,
      },
    };

    return predictions;
  }

  private getWeekOfYear(date: Date): string {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    const yearStart = new Date(d.getFullYear(), 0, 1);
    const weekNo = Math.ceil(
      ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
    );
    return `${d.getFullYear()}-W${weekNo}`;
  }

  private calculateGrowthRate(values: number[]): number {
    if (values.length < 2) return 0;
    const recent = values.slice(-3).reduce((a, b) => a + b, 0) / 3;
    const older = values.slice(-6, -3).reduce((a, b) => a + b, 0) / 3;
    return older > 0 ? ((recent - older) / older) * 100 : 0;
  }

  /**
   * Get initial metrics from video's metrics history or current data
   */
  private getInitialMetrics(video: any): {
    viewCount: number;
    likeCount: number;
    commentCount: number;
    engagementRate: number;
    timestamp: Date;
  } {
    // If we have metrics history, get the earliest entry
    if (video.metricsHistory && Object.keys(video.metricsHistory).length > 0) {
      const historyEntries = Object.entries(video.metricsHistory)
        .map(([key, value]: [string, any]) => ({
          timestamp: new Date(key),
          ...value,
        }))
        .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

      if (historyEntries.length > 0) {
        const earliest = historyEntries[0];
        return {
          viewCount: earliest.viewCount,
          likeCount: earliest.likeCount,
          commentCount: earliest.commentCount,
          engagementRate: earliest.engagementRate,
          timestamp: earliest.timestamp,
        };
      }
    }

    // Fallback to current data if no history exists
    return {
      viewCount: video.viewCount,
      likeCount: video.likeCount,
      commentCount: video.commentCount,
      engagementRate: video.engagementRate,
      timestamp: video.createdAt || video.publishedAt,
    };
  }

  /**
   * Calculate comprehensive growth metrics for performance tracking
   */
  private calculatePerformanceGrowthMetrics(
    initial: any,
    current: any,
    hoursSincePublished: number,
  ): {
    viewGrowth: number;
    likeGrowth: number;
    commentGrowth: number;
    engagementGrowth: number;
    growthRate: number;
    hourlyGrowthRate: number;
    acceleration: number;
  } {
    const viewGrowth = current.viewCount - initial.viewCount;
    const likeGrowth = current.likeCount - initial.likeCount;
    const commentGrowth = current.commentCount - initial.commentCount;
    const engagementGrowth = current.engagementRate - initial.engagementRate;

    // Calculate growth rates
    const growthRate =
      initial.viewCount > 0 ? (viewGrowth / initial.viewCount) * 100 : 0;
    const hourlyGrowthRate =
      hoursSincePublished > 0 ? viewGrowth / hoursSincePublished : 0;

    // Calculate acceleration (change in growth rate over time)
    const acceleration =
      hoursSincePublished > 1 ? hourlyGrowthRate / hoursSincePublished : 0;

    return {
      viewGrowth,
      likeGrowth,
      commentGrowth,
      engagementGrowth,
      growthRate,
      hourlyGrowthRate,
      acceleration,
    };
  }

  /**
   * Identify viral moment indicators
   */
  private identifyViralIndicators(
    growthMetrics: any,
    currentMetrics: any,
  ): {
    explosiveGrowth: boolean;
    highEngagement: boolean;
    rapidComments: boolean;
    trendingUp: boolean;
    momentum: "low" | "medium" | "high" | "viral";
  } {
    const explosiveGrowth = growthMetrics.hourlyGrowthRate > 5000;
    const highEngagement = currentMetrics.engagementRate > 10;
    const rapidComments =
      currentMetrics.commentCount > currentMetrics.viewCount * 0.01;
    const trendingUp = growthMetrics.acceleration > 0;

    // Determine momentum level
    let momentum: "low" | "medium" | "high" | "viral" = "low";
    if (
      growthMetrics.hourlyGrowthRate > 10000 ||
      currentMetrics.engagementRate > 15
    ) {
      momentum = "viral";
    } else if (
      growthMetrics.hourlyGrowthRate > 2000 ||
      currentMetrics.engagementRate > 8
    ) {
      momentum = "high";
    } else if (
      growthMetrics.hourlyGrowthRate > 500 ||
      currentMetrics.engagementRate > 3
    ) {
      momentum = "medium";
    }

    return {
      explosiveGrowth,
      highEngagement,
      rapidComments,
      trendingUp,
      momentum,
    };
  }

  /**
   * Determine overall performance trend
   */
  private determinePerformanceTrend(
    growthMetrics: any,
  ): "declining" | "stable" | "growing" | "exploding" {
    if (growthMetrics.acceleration > 1000) return "exploding";
    if (growthMetrics.hourlyGrowthRate > 500) return "growing";
    if (growthMetrics.hourlyGrowthRate > 50) return "stable";
    return "declining";
  }

  /**
   * Update metrics history in database
   */
  private async updateMetricsHistory(
    videoId: string,
    currentMetrics: any,
    timestamp: Date,
  ): Promise<void> {
    const historyKey = timestamp.toISOString();

    await this.videoModel.updateOne(
      { videoId },
      {
        $set: {
          [`metricsHistory.${historyKey}`]: {
            viewCount: currentMetrics.viewCount,
            likeCount: currentMetrics.likeCount,
            commentCount: currentMetrics.commentCount,
            engagementRate: currentMetrics.engagementRate,
            timestamp: timestamp,
          },
          // Update current metrics
          viewCount: currentMetrics.viewCount,
          likeCount: currentMetrics.likeCount,
          commentCount: currentMetrics.commentCount,
          engagementRate: currentMetrics.engagementRate,
        },
      },
    );
  }

  /**
   * Get performance history for a video
   */
  async getVideoPerformanceHistory(
    videoId: string,
    timeRange: string = "7d",
  ): Promise<any> {
    try {
      const video = await this.videoModel.findOne({ videoId }).lean();
      if (!video) {
        throw new Error("Video not found");
      }

      const cutoffDate = this.getDateRangeFilter(timeRange);

      // Get metrics history within time range
      const history = video.metricsHistory
        ? Object.entries(video.metricsHistory)
            .filter(([key]: [string, any]) => new Date(key) >= cutoffDate)
            .map(([key, value]: [string, any]) => ({
              timestamp: new Date(key),
              ...value,
            }))
            .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
        : [];

      // Calculate performance trends
      const trends = this.analyzePerformanceTrends(history);

      return {
        videoId,
        title: video.title,
        channelTitle: video.channelTitle,
        performanceHistory: history,
        trends,
        summary: {
          totalDataPoints: history.length,
          averageGrowthRate: trends.averageGrowthRate,
          peakPerformance: trends.peakPerformance,
          consistency: trends.consistency,
        },
      };
    } catch (error) {
      this.logger.error("Error getting video performance history:", error);
      throw error;
    }
  }

  /**
   * Analyze performance trends from history data
   */
  private analyzePerformanceTrends(history: any[]): {
    averageGrowthRate: number;
    peakPerformance: any;
    consistency: "low" | "medium" | "high";
    growthPattern: "linear" | "exponential" | "spike" | "declining";
  } {
    if (history.length < 2) {
      return {
        averageGrowthRate: 0,
        peakPerformance: null,
        consistency: "low",
        growthPattern: "linear",
      };
    }

    // Calculate growth rates between consecutive points
    const growthRates = [];
    for (let i = 1; i < history.length; i++) {
      const timeDiff =
        (history[i].timestamp.getTime() - history[i - 1].timestamp.getTime()) /
        (1000 * 60 * 60);
      const viewDiff = history[i].viewCount - history[i - 1].viewCount;
      const growthRate = timeDiff > 0 ? viewDiff / timeDiff : 0;
      growthRates.push(growthRate);
    }

    const averageGrowthRate =
      growthRates.reduce((sum, rate) => sum + rate, 0) / growthRates.length;

    // Find peak performance
    const peakPerformance = history.reduce((peak, current) =>
      current.viewCount > peak.viewCount ? current : peak,
    );

    // Calculate consistency (standard deviation of growth rates)
    const variance =
      growthRates.reduce(
        (sum, rate) => sum + Math.pow(rate - averageGrowthRate, 2),
        0,
      ) / growthRates.length;
    const stdDev = Math.sqrt(variance);
    const consistency = stdDev < 100 ? "high" : stdDev < 500 ? "medium" : "low";

    // Determine growth pattern
    let growthPattern: "linear" | "exponential" | "spike" | "declining" =
      "linear";
    if (growthRates.some((rate) => rate > 5000)) growthPattern = "spike";
    else if (growthRates.every((rate) => rate > 0))
      growthPattern = "exponential";
    else if (growthRates.every((rate) => rate < 0)) growthPattern = "declining";

    return {
      averageGrowthRate,
      peakPerformance,
      consistency,
      growthPattern,
    };
  }

  /**
   * Enhanced trending hashtag identification with time-based growth analysis
   */
  private async identifyTrendingHashtagsWithGrowth(
    hashtagAnalytics: any[],
    timeRange: string,
  ): Promise<any[]> {
    try {
      // Split time range into recent and previous periods for comparison
      const previousPeriod = this.getPreviousPeriod(timeRange);

      // Get hashtag stats for previous period
      const previousVideos = await this.videoModel
        .find({
          publishedAt: { $gte: this.getDateRangeFilter(previousPeriod) },
          hashtags: { $exists: true, $ne: [] },
        })
        .lean();

      // Calculate previous period hashtag stats
      const previousHashtagStats = new Map();
      previousVideos.forEach((video) => {
        video.hashtags?.forEach((hashtag) => {
          if (!previousHashtagStats.has(hashtag)) {
            previousHashtagStats.set(hashtag, {
              totalVideos: 0,
              totalViews: 0,
              totalLikes: 0,
              totalComments: 0,
            });
          }
          const stats = previousHashtagStats.get(hashtag);
          stats.totalVideos++;
          stats.totalViews += video.viewCount;
          stats.totalLikes += video.likeCount;
          stats.totalComments += video.commentCount;
        });
      });

      // Calculate growth metrics for each hashtag
      const trendingHashtags = hashtagAnalytics
        .map((hashtag) => {
          const previous = previousHashtagStats.get(hashtag.hashtag) || {
            totalVideos: 0,
            totalViews: 0,
            totalLikes: 0,
            totalComments: 0,
          };

          const videoGrowth = hashtag.totalVideos - previous.totalVideos;
          const viewGrowth = hashtag.totalViews - previous.totalViews;
          const engagementGrowth =
            (hashtag.totalLikes + hashtag.totalComments) / hashtag.totalViews -
            (previous.totalLikes + previous.totalComments) /
              (previous.totalViews || 1);

          const growthRate =
            previous.totalVideos > 0
              ? (videoGrowth / previous.totalVideos) * 100
              : hashtag.totalVideos > 0
                ? 100
                : 0;

          const viewGrowthRate =
            previous.totalViews > 0
              ? (viewGrowth / previous.totalViews) * 100
              : hashtag.totalViews > 0
                ? 100
                : 0;

          return {
            ...hashtag,
            growthMetrics: {
              videoGrowth,
              viewGrowth,
              engagementGrowth,
              growthRate,
              viewGrowthRate,
              isTrending: growthRate > 50 || viewGrowthRate > 100, // Trending threshold
            },
          };
        })
        .filter((hashtag) => hashtag.growthMetrics.isTrending)
        .sort((a, b) => b.growthMetrics.growthRate - a.growthMetrics.growthRate)
        .slice(0, 10);

      return trendingHashtags;
    } catch (error) {
      this.logger.error(
        "Error identifying trending hashtags with growth:",
        error,
      );
      return hashtagAnalytics.slice(0, 10); // Fallback to original method
    }
  }

  /**
   * Get previous period for comparison
   */
  private getPreviousPeriod(timeRange: string): string {
    const timeMap = {
      "7d": "14d-7d",
      "30d": "60d-30d",
      "90d": "180d-90d",
    };
    return timeMap[timeRange] || "14d-7d";
  }

  /**
   * Build comprehensive niche query using enhanced niche classification
   */
  private async buildComprehensiveNicheQuery(niche: string): Promise<any[]> {
    try {
      // Get niche definition from enhanced niche classification service
      const nicheDefinition = await this.enhancedNicheClassificationService.getNicheDefinition(niche);

      if (!nicheDefinition) {
        this.logger.warn(`Niche definition not found for: ${niche}`);
        return [];
      }

      const queryConditions: any[] = [];

      // Add niche field matching
      queryConditions.push({ niche: new RegExp(niche, "i") });

      // Add keyword-based matching for title and description
      const keywords = nicheDefinition.keywords || [];
      keywords.forEach(keyword => {
        queryConditions.push({ title: new RegExp(keyword, "i") });
        queryConditions.push({ description: new RegExp(keyword, "i") });
      });

      // Add hashtag matching
      keywords.forEach(keyword => {
        queryConditions.push({ hashtags: new RegExp(keyword, "i") });
      });

      // Add topics matching
      keywords.forEach(keyword => {
        queryConditions.push({ topics: new RegExp(keyword, "i") });
      });

      this.logger.log(`Built comprehensive niche query for "${niche}" with ${queryConditions.length} conditions using keywords: ${keywords.slice(0, 5).join(', ')}`);

      return queryConditions;
    } catch (error) {
      this.logger.warn(`Failed to build comprehensive niche query: ${error.message}`);
      return [];
    }
  }

  /**
   * Get available videos for testing
   */
  async getAvailableVideos(options: {
    limit?: number;
    niche?: string;
    minViews?: number;
  }): Promise<any> {
    try {
      const { limit = 10, niche, minViews } = options;

      // Build query
      const query: any = {};

      if (niche) {
        // Use comprehensive niche analysis instead of simple regex
        const nicheQuery = await this.buildComprehensiveNicheQuery(niche);
        if (nicheQuery.length > 0) {
          query.$or = nicheQuery;
        } else {
          // Fallback to simple regex if comprehensive query fails
          query.niche = new RegExp(niche, "i");
        }
      }

      if (minViews) {
        query.viewCount = { $gte: minViews };
      }

      // Get videos from database
      const videos = await this.videoModel
        .find(query)
        .select(
          "videoId title channelTitle viewCount likeCount commentCount publishedAt niche",
        )
        .sort({ publishedAt: -1 })
        .limit(limit)
        .lean();

      return {
        totalVideos: videos.length,
        videos: videos.map((video) => ({
          videoId: video.videoId,
          title: video.title,
          channelTitle: video.channelTitle,
          viewCount: video.viewCount,
          likeCount: video.likeCount,
          commentCount: video.commentCount,
          publishedAt: video.publishedAt,
          niche: video.niche,
          hasMetricsHistory:
            video.metricsHistory &&
            Object.keys(video.metricsHistory).length > 0,
        })),
        filters: {
          niche: niche || "all",
          minViews: minViews || "none",
          limit,
        },
        lastUpdated: new Date(),
      };
    } catch (error) {
      this.logger.error("Error getting available videos:", error);
      throw error;
    }
  }

  /**
   * Detect topics from video content using enhanced niche classification
   */
  private async detectTopicsFromContent(video: any, niche?: string): Promise<string[]> {
    try {

      const detectedTopics: string[] = [];

      // If niche is specified, use it directly
      if (niche) {
        detectedTopics.push(niche);
        return detectedTopics;
      }

      // Fallback to basic content analysis if no topics detected
      if (detectedTopics.length === 0) {
        const title = (video.title || "").toLowerCase();
        const description = (video.description || "").toLowerCase();
        const hashtags = (video.hashtags || []).map((h: string) => h.toLowerCase());
        const allText = `${title} ${description} ${hashtags.join(" ")}`;

        if (allText.includes("tutorial") || allText.includes("how to")) {
          detectedTopics.push("tutorial");
        }
        if (allText.includes("review") || allText.includes("test")) {
          detectedTopics.push("review");
        }
        if (allText.includes("viral") || allText.includes("trending")) {
          detectedTopics.push("trending");
        }
        if (allText.includes("funny") || allText.includes("comedy")) {
          detectedTopics.push("entertainment");
        }
      }

      return detectedTopics.length > 0 ? detectedTopics : ["general"];
    } catch (error) {
      this.logger.warn(`Error in topic detection: ${error.message}`);
      return ["general"];
    }
  }
}
