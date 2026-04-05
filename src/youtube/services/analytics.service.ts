import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { BaseAnalyticsService } from "./base-analytics.service";
import { VideoAnalytics } from "../schemas/video-analytics.schema";
import {
  ITrendAnalysis,
  INicheAnalysis,
  IViralityScore,
} from "./analytics.interface";
import { ContentIdeaService } from "./content-idea.service";
import { PostingTimeService } from "./posting-time.service";
import { YouTubeAnalyticsService } from "../youtube-analytics.service";

@Injectable()
export class AnalyticsService extends BaseAnalyticsService {
  constructor(
    @InjectModel("VideoAnalytics") protected videoModel: Model<VideoAnalytics>,
    private readonly contentIdeaService: ContentIdeaService,
    private readonly postingTimeService: PostingTimeService,
    private readonly youtubeAnalyticsService: YouTubeAnalyticsService,
  ) {
    super(videoModel);
  }

  async getVideoAnalytics(videoId: string) {
    return this.videoModel.findOne({ videoId }).exec();
  }

  async saveVideoAnalytics(videoData: any) {
    const video = new this.videoModel(videoData);
    return video.save();
  }

  async updateVideoAnalytics(videoId: string, updates: any) {
    return this.videoModel
      .findOneAndUpdate(
        { videoId },
        { $set: updates },
        { new: true, upsert: true },
      )
      .exec();
  }

  async getVideosForMetricsUpdate(limit: number = 100) {
    return this.videoModel
      .find()
      .sort({ updatedAt: 1 }) // Get oldest updated first
      .limit(limit)
      .exec();
  }

  async calculateViralityScore(videoId: string): Promise<IViralityScore> {
    if (!videoId) {
      throw new Error("Video ID is required");
    }

    const video = await this.videoModel.findOne({ videoId });
    if (!video) {
      this.logger.warn(`Video not found in database: ${videoId}`);
      throw new Error("Video not found in database");
    }

    try {
      // Simple virality score calculation with null checks
      const viewCount = video.viewCount || 0;
      const likeCount = video.likeCount || 0;
      const commentCount = video.commentCount || 0;
      const publishedAt = video.publishedAt || new Date();
      const duration = video.duration || 60; // Default to 60 seconds if duration is missing

      const ageInHours = Math.max(
        1,
        (new Date().getTime() - new Date(publishedAt).getTime()) /
          (1000 * 60 * 60),
      );
      const engagementRate =
        (likeCount + commentCount * 2) / Math.max(1, viewCount);
      const viewVelocity = viewCount / ageInHours;
      const durationScore = Math.min(1, duration / 60); // Normalize to 0-1 for 0-60s videos

      // Calculate base score (weighted average)
      const baseScore =
        engagementRate * 0.4 + viewVelocity * 0.5 + durationScore * 0.1;

      // Calculate recency factor (higher for newer videos)
      const recencyFactor = 1 / Math.max(1, ageInHours / 24);

      // Calculate final score (0-100 scale)
      const finalScore = Math.min(100, Math.max(0, baseScore * 100));

      return {
        videoId,
        score: finalScore,
        metrics: {
          baseScore,
          engagementRate,
          recencyFactor,
          durationFactor: durationScore,
          isShorts: video.isShorts || false,
        },
        timestamp: new Date(),
      };
    } catch (error) {
      this.logger.error(
        `Error calculating virality score for video ${videoId}:`,
        error,
      );
      throw error;
    }
  }

  // Implement the abstract method from BaseAnalyticsService
  async generateContentIdeas(niche: string, count: number = 5): Promise<any[]> {
    try {
      const options = {
        niche,
        limit: count,
      };
      return await this.contentIdeaService.generateContentIdeas(options);
    } catch (error) {
      this.logger.error(
        `Error generating content ideas for niche ${niche}:`,
        error,
      );
      return [];
    }
  }

  async analyzeTrends(
    timeRange: "24h" | "7d" | "30d",
  ): Promise<ITrendAnalysis> {
    const dateFilter = this.getDateRangeFilter(timeRange);
    const trendingVideos = await this.videoModel
      .find({
        publishedAt: { $gte: dateFilter },
        viewCount: { $gt: 1000 },
      })
      .sort({ engagementRate: -1, viewCount: -1 })
      .limit(50)
      .lean();

    return {
      timeRange,
      totalVideosAnalyzed: trendingVideos.length,
      topHashtags: [],
      topTopics: [],
      topNiches: [],
      trendingVideos: trendingVideos.map((v) => ({
        videoId: v.videoId,
        title: v.title,
        channelTitle: v.channelTitle,
        viewCount: v.viewCount,
        engagementRate: v.engagementRate,
        viralityScore: v.viralityScore,
      })),
      timestamp: new Date(),
    };
  }

  /**
   * Enhanced niche analysis with hybrid data (database + real-time API)
   */
  async analyzeNiche(
    niche: string,
    useRealTimeData: boolean = true,
    userId?: string,
  ): Promise<INicheAnalysis> {
    try {
      // Get database data (historical)
      const dbVideos = await this.getDatabaseVideos(niche);

      let realTimeVideos = [];
      if (useRealTimeData && userId) {
        try {
          // Get real-time data from YouTube API
          realTimeVideos = await this.getRealTimeNicheData(niche, userId);
          this.logger.log(
            `Fetched ${realTimeVideos.length} real-time videos for niche: ${niche}`,
          );
        } catch (error) {
          this.logger.warn(
            `Failed to get real-time data for niche ${niche}:`,
            error,
          );
          // Continue with database data only
        }
      }

      // Combine data sources
      const combinedVideos = this.combineDataSources(dbVideos, realTimeVideos);

      if (combinedVideos.length === 0) {
        throw new Error(`No videos found for niche: ${niche}`);
      }

      // Generate enhanced features using existing services
      const [trendingHashtags, contentIdeas, postingTimeAnalysis] =
        await Promise.all([
          this.analyzeNicheHashtags(combinedVideos),
          this.generateContentIdeas(niche, 5),
          this.analyzePostingTimes(combinedVideos),
        ]);

      return {
        niche,
        metrics: this.calculateNicheMetrics(combinedVideos),
        topVideos: this.getTopVideos(combinedVideos),
        topChannels: this.analyzeTopChannels(combinedVideos),
        trendingHashtags,
        contentIdeas,
        postingTimeAnalysis,
        lastUpdated: new Date(),
        dataSource: {
          database: dbVideos.length,
          realTime: realTimeVideos.length,
          combined: combinedVideos.length,
          reliability: this.calculateDataReliability(
            dbVideos.length,
            realTimeVideos.length,
          ),
        },
      };
    } catch (error) {
      this.logger.error(`Error in hybrid niche analysis for ${niche}:`, error);
      throw error;
    }
  }

  /**
   * Get database videos for a niche
   */
  private async getDatabaseVideos(niche: string): Promise<any[]> {
    return this.videoModel
      .find({ niche: new RegExp(niche, "i") })
      .sort({ publishedAt: -1 })
      .limit(1000)
      .lean();
  }

  /**
   * Get real-time niche data from YouTube API
   */
  private async getRealTimeNicheData(
    niche: string,
    userId: string,
  ): Promise<any[]> {
    const keywords = this.getNicheKeywords(niche);
    const realTimeVideos = [];

    for (const keyword of keywords.slice(0, 5)) {
      // Limit API calls
      try {
        const searchResults =
          await this.youtubeAnalyticsService.searchShortsByKeyword(
            userId,
            keyword,
            10,
            {},
          );
        realTimeVideos.push(...searchResults);
      } catch (error) {
        this.logger.warn(`Failed to search for keyword ${keyword}:`, error);
      }
    }

    return realTimeVideos;
  }

  /**
   * Combine database and real-time data
   */
  private combineDataSources(dbData: any[], realTimeData: any[]): any[] {
    if (realTimeData.length === 0) return dbData;

    // Create a map of existing videos by videoId
    const existingVideos = new Map(
      dbData.map((video) => [video.videoId, video]),
    );

    // Add or update with real-time data
    realTimeData.forEach((realTimeVideo) => {
      if (existingVideos.has(realTimeVideo.videoId)) {
        // Update existing video with real-time data
        const existing = existingVideos.get(realTimeVideo.videoId);
        existingVideos.set(realTimeVideo.videoId, {
          ...existing,
          ...realTimeVideo,
          isRealTime: true,
        });
      } else {
        // Add new real-time video
        existingVideos.set(realTimeVideo.videoId, {
          ...realTimeVideo,
          isRealTime: true,
        });
      }
    });

    return Array.from(existingVideos.values());
  }

  /**
   * Get niche keywords for API searches
   */
  private getNicheKeywords(niche: string): string[] {
    const keywordMap = {
      fitness: ["workout", "gym", "exercise", "fitness", "training"],
      cooking: ["recipe", "food", "cook", "kitchen", "chef"],
      gaming: ["game", "gaming", "play", "stream", "esports"],
      tech: ["technology", "tech", "review", "gadget", "app"],
      beauty: ["beauty", "makeup", "skincare", "cosmetics", "fashion"],
    };

    return keywordMap[niche.toLowerCase()] || [niche];
  }

  /**
   * Analyze hashtags specifically within the niche
   */
  private async analyzeNicheHashtags(nicheVideos: any[]): Promise<any[]> {
    try {
      // Extract hashtags from niche videos
      const hashtagStats = new Map();

      nicheVideos.forEach((video) => {
        const hashtags = [
          ...this.extractHashtags(video.title || ""),
          ...this.extractHashtags(video.description || ""),
          ...(video.hashtags || []),
        ].filter((tag, index, arr) => arr.indexOf(tag) === index);

        hashtags.forEach((hashtag) => {
          if (!hashtagStats.has(hashtag)) {
            hashtagStats.set(hashtag, {
              hashtag,
              count: 0,
              totalViews: 0,
              totalLikes: 0,
              totalComments: 0,
              videos: [],
            });
          }
          const stats = hashtagStats.get(hashtag);
          stats.count++;
          stats.totalViews += video.viewCount || 0;
          stats.totalLikes += video.likeCount || 0;
          stats.totalComments += video.commentCount || 0;
          stats.videos.push(video);
        });
      });

      // Calculate engagement rates and sort by performance
      const hashtagAnalytics = Array.from(hashtagStats.values())
        .map((stats) => ({
          hashtag: stats.hashtag,
          count: stats.count,
          engagementRate:
            stats.totalViews > 0
              ? ((stats.totalLikes + stats.totalComments) / stats.totalViews) *
                100
              : 0,
          totalViews: stats.totalViews,
          totalLikes: stats.totalLikes,
          totalComments: stats.totalComments,
          avgViews: Math.round(stats.totalViews / stats.count),
          nicheSpecificity: this.calculateNicheSpecificity(
            stats.hashtag,
            nicheVideos[0]?.niche,
          ),
        }))
        .sort((a, b) => b.engagementRate - a.engagementRate)
        .slice(0, 10);

      return hashtagAnalytics;
    } catch (error) {
      this.logger.error("Error analyzing niche hashtags:", error);
      return [];
    }
  }

  /**
   * Calculate how specific a hashtag is to the niche
   */
  private calculateNicheSpecificity(hashtag: string, niche: string): number {
    const nicheKeywords = {
      fitness: ["workout", "gym", "exercise", "fitness", "health", "training"],
      cooking: ["recipe", "food", "cook", "kitchen", "chef", "meal"],
      gaming: ["game", "gaming", "play", "stream", "esports", "gamer"],
      tech: ["technology", "tech", "review", "gadget", "app", "software"],
      beauty: ["beauty", "makeup", "skincare", "cosmetics", "fashion", "style"],
    };

    const nicheWords = nicheKeywords[niche?.toLowerCase()] || [];
    const hashtagLower = hashtag.toLowerCase();

    // Check if hashtag contains niche-specific keywords
    const hasNicheKeywords = nicheWords.some((keyword) =>
      hashtagLower.includes(keyword),
    );

    // Check if hashtag is generic (common across all niches)
    const genericHashtags = [
      "shorts",
      "viral",
      "trending",
      "youtube",
      "subscribe",
    ];
    const isGeneric = genericHashtags.some((generic) =>
      hashtagLower.includes(generic),
    );

    if (hasNicheKeywords) return 0.9; // High specificity
    if (isGeneric) return 0.1; // Low specificity
    return 0.5; // Medium specificity
  }

  /**
   * Analyze optimal posting times for the niche
   */
  private async analyzePostingTimes(nicheVideos: any[]): Promise<any[]> {
    try {
      // Group videos by hour of publication
      const hourlyStats = new Map();

      nicheVideos.forEach((video) => {
        if (video.publishedAt) {
          const hour = new Date(video.publishedAt).getHours();
          if (!hourlyStats.has(hour)) {
            hourlyStats.set(hour, {
              hour,
              totalVideos: 0,
              totalViews: 0,
              totalLikes: 0,
              totalComments: 0,
              videos: [],
            });
          }
          const stats = hourlyStats.get(hour);
          stats.totalVideos++;
          stats.totalViews += video.viewCount || 0;
          stats.totalLikes += video.likeCount || 0;
          stats.totalComments += video.commentCount || 0;
          stats.videos.push(video);
        }
      });

      // Calculate average engagement for each hour
      const postingTimeAnalysis = Array.from(hourlyStats.values())
        .map((stats) => ({
          hour: stats.hour,
          avgEngagement:
            stats.totalViews > 0
              ? ((stats.totalLikes + stats.totalComments) / stats.totalViews) *
                100
              : 0,
          sampleSize: stats.totalVideos,
          avgViews: Math.round(stats.totalViews / stats.totalVideos),
          totalVideos: stats.totalVideos,
        }))
        .sort((a, b) => b.avgEngagement - a.avgEngagement)
        .slice(0, 8); // Top 8 hours

      return postingTimeAnalysis;
    } catch (error) {
      this.logger.error("Error analyzing posting times:", error);
      return [];
    }
  }

  /**
   * Extract hashtags from text
   */
  private extractHashtags(text: string): string[] {
    const hashtagRegex = /#[\w\u0590-\u05ff]+/g;
    return text.match(hashtagRegex) || [];
  }

  /**
   * Get date range filter for time-based queries
   */
  protected getDateRangeFilter(timeRange: string): Date {
    const now = new Date();
    switch (timeRange) {
      case "24h":
        return new Date(now.getTime() - 24 * 60 * 60 * 1000);
      case "7d":
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      case "30d":
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      default:
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }
  }

  private calculateNicheMetrics(videos: any[]) {
    const totalVideos = videos.length;
    const totalViews = videos.reduce((sum, v) => sum + v.viewCount, 0);
    const totalLikes = videos.reduce((sum, v) => sum + v.likeCount, 0);
    const totalComments = videos.reduce((sum, v) => sum + v.commentCount, 0);
    const avgEngagementRate =
      videos.reduce((sum, v) => sum + v.engagementRate, 0) / totalVideos;

    return {
      totalVideos,
      totalViews,
      totalLikes,
      totalComments,
      avgEngagementRate,
      avgViralityScore:
        videos.reduce((sum, v) => sum + (v.viralityScore || 0), 0) /
        totalVideos,
    };
  }

  private getTopVideos(videos: any[]) {
    return [...videos]
      .sort((a, b) => b.viralityScore - a.viralityScore)
      .slice(0, 10)
      .map((v) => ({
        videoId: v.videoId,
        title: v.title,
        channelTitle: v.channelTitle,
        views: v.viewCount,
        engagementRate: v.engagementRate,
        viralityScore: v.viralityScore,
      }));
  }

  private analyzeTopChannels(videos: any[]) {
    const channelMap = new Map();
    videos.forEach((v) => {
      const channel = channelMap.get(v.channelId) || { count: 0, views: 0 };
      channel.count += 1;
      channel.views += v.viewCount;
      channelMap.set(v.channelId, channel);
    });

    return Array.from(channelMap.entries())
      .sort((a, b) => b[1].views - a[1].views)
      .slice(0, 10)
      .map(([channelId, { count, views }]) => ({
        channelId,
        videoCount: count,
        totalViews: views,
        avgViews: Math.round(views / count),
      }));
  }

  /**
   * Calculate data reliability score
   */
  private calculateDataReliability(
    dbCount: number,
    realTimeCount: number,
  ): number {
    const total = dbCount + realTimeCount;
    if (total === 0) return 0;

    // Higher reliability if we have both data sources
    const hybridBonus = dbCount > 0 && realTimeCount > 0 ? 0.2 : 0;
    const baseReliability = total / 100; // Normalize to 0-1

    return Math.min(1, baseReliability + hybridBonus);
  }
}
