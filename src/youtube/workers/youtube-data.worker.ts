import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { SchedulerRegistry } from "@nestjs/schedule";
import { CronJob } from "cron";
import { YouTubeAnalyticsService } from "../youtube-analytics.service";
import { AnalyticsService } from "../services/analytics.service";
import { MongoDBMetricsService } from "../../monitoring/services/mongodb-metrics.service";
import { ConfigService } from "@nestjs/config";
import {
  VideoAnalytics,
  VideoAnalyticsDocument,
} from "../schemas/video-analytics.schema";
import { Model } from "mongoose";
import { InjectModel } from "@nestjs/mongoose";
import { CronExpression } from "@nestjs/schedule";
import { UsersService } from "../../users/users.service";
import { AuthService } from "../../auth/auth.service";

@Injectable()
export class YouTubeDataWorker implements OnModuleInit {
  private readonly logger = new Logger(YouTubeDataWorker.name);
  private readonly collectionInterval = CronExpression.EVERY_12_HOURS;
  private readonly metricsInterval = CronExpression.EVERY_12_HOURS;
  private readonly maxVideosPerRun = 50;

  private systemUserId: string;
  private systemUserIdObject: any; // ObjectId version
  private tokenRefreshInterval: NodeJS.Timeout;

  constructor(
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly youtubeService: YouTubeAnalyticsService,
    private readonly analyticsService: AnalyticsService,
    private readonly metricsService: MongoDBMetricsService,
    private readonly configService: ConfigService,
    @InjectModel(VideoAnalytics.name)
    private readonly videoAnalyticsModel: Model<VideoAnalyticsDocument>,
    private readonly usersService: UsersService,
    private readonly authService: AuthService,
  ) {}

  async onModuleInit() {
    try {
      // Get the system user ID from configuration
      const config = this.configService.get("system");
      this.systemUserId = config.youtubeUserIdString; // Using the string version for logging
      this.systemUserIdObject = config.youtubeUserId; // Using the ObjectId version for database queries

      if (!this.systemUserId) {
        this.logger.warn(
          "SYSTEM_YOUTUBE_USER_ID is not configured. YouTube data collection will be disabled.",
        );
        return; // Don't throw error, just disable the worker
      }

      this.logger.log(
        `Using configured system user ID for YouTube data collection: ${this.systemUserId}`,
      );

      // Schedule token refresh to run every 30 minutes
      try {
        await this.scheduleTokenRefresh();
      } catch (error) {
        this.logger.warn("Failed to schedule token refresh:", error.message);
        // Continue without token refresh
      }

      // Schedule the regular jobs
      this.scheduleJobs();
    } catch (error) {
      this.logger.error("Failed to initialize YouTube data worker:", error);
      // Don't throw error to prevent module initialization failure
      // The worker will be disabled but the app will continue to run
    }
  }

  async onModuleDestroy() {
    if (this.tokenRefreshInterval) {
      clearInterval(this.tokenRefreshInterval);
    }
  }

  private async scheduleTokenRefresh() {
    await this.refreshAccessTokenIfNeeded();

    // Schedule refresh check every 30 minutes
    this.tokenRefreshInterval = setInterval(
      async () => {
        try {
          await this.refreshAccessTokenIfNeeded();
        } catch (error) {
          this.logger.error("Error during scheduled token refresh:", error);
        }
      },
      30 * 60 * 1000,
    ); // 30 minutes
  }

  private async refreshAccessTokenIfNeeded(): Promise<boolean> {
    if (!this.systemUserId) {
      this.logger.error("System user ID not available for token refresh");
      return false;
    }

    try {
      const accessToken = await this.authService.getValidYouTubeAccessToken(
        this.systemUserIdObject,
      );

      if (accessToken) {
        this.logger.log("YouTube access token is valid");
        return true;
      } else {
        this.logger.error("Failed to get valid YouTube access token");
        return false;
      }
    } catch (error) {
      this.logger.error("Failed to check/refresh YouTube access token:", error);

      // If it's an invalid_grant error, log it but don't spam the logs
      if (error.message && error.message.includes("invalid_grant")) {
        this.logger.warn(
          "YouTube tokens have expired or been revoked. System user needs to re-authenticate with YouTube.",
        );
        // You might want to send a notification here to admin
      }

      return false;
    }
  }

  private scheduleJobs() {
    try {
      // Schedule video data collection with unique name
      const videoCollectionJob = new CronJob(this.collectionInterval, () =>
        this.collectVideoData(),
      );

      const videoJobName = "youtubeVideoDataCollection";
      try {
        this.schedulerRegistry.addCronJob(videoJobName, videoCollectionJob);
        videoCollectionJob.start();
        this.logger.log("Scheduled video data collection job");
      } catch (error) {
        if (error.message.includes("already exists")) {
          this.logger.warn(`Cron job ${videoJobName} already exists, skipping`);
        } else {
          throw error;
        }
      }

      // Schedule metrics collection with unique name
      const metricsJob = new CronJob(this.metricsInterval, () =>
        this.collectMetrics(),
      );

      const metricsJobName = "youtubeMetricsCollection";
      try {
        this.schedulerRegistry.addCronJob(metricsJobName, metricsJob);
        metricsJob.start();
        this.logger.log("Scheduled metrics collection job");
      } catch (error) {
        if (error.message.includes("already exists")) {
          this.logger.warn(
            `Cron job ${metricsJobName} already exists, skipping`,
          );
        } else {
          throw error;
        }
      }
    } catch (error) {
      this.logger.error("Error scheduling jobs:", error);
      // Don't throw error to prevent module initialization failure
    }
  }

  async collectVideoData() {
    this.logger.log("Starting YouTube Shorts data collection");

    if (!this.systemUserId) {
      this.logger.error(
        "System user ID not configured for YouTube data collection",
      );
      return;
    }

    // Use AuthService to get valid token
    let hasValidToken = false;
    try {
      const accessToken = await this.authService.getValidYouTubeAccessToken(
        this.systemUserIdObject,
      );
      if (!accessToken) {
        this.logger.error("No valid YouTube access token available");
      } else {
        this.logger.log("YouTube authentication successful");
        hasValidToken = true;
      }
    } catch (error) {
      this.logger.error("YouTube authentication failed:", error.message);

      // If it's an invalid_grant error, we can still work with existing data
      if (error.message && error.message.includes("invalid_grant")) {
        this.logger.warn(
          "YouTube tokens expired. Continuing with existing database data only.",
        );
        hasValidToken = false;
      } else {
        return; // For other errors, stop the process
      }
    }

    try {
      let trendingShorts: any[] = [];

      if (hasValidToken) {
        // Enhanced trending Shorts fetching with better error handling
        trendingShorts = await this.getTrendingShortsWithFallbacks();
      } else {
        this.logger.log("Using existing database data due to invalid tokens");
        // Get recent videos from database instead
        trendingShorts = await this.getRecentVideosFromDatabase();
      }

      if (!trendingShorts || trendingShorts.length === 0) {
        this.logger.warn(
          "No trending Shorts available, skipping this collection cycle",
        );
        return;
      }

      this.logger.log(
        `Retrieved ${trendingShorts.length} trending Shorts for processing`,
      );

      // Process each Short with enhanced error handling
      let processedCount = 0;
      let errorCount = 0;

      for (const short of trendingShorts) {
        try {
          await this.processVideo(short);
          processedCount++;

          // Add small delay to avoid rate limiting
          await new Promise((resolve) => setTimeout(resolve, 100));
        } catch (error) {
          errorCount++;
          this.logger.error(
            `Error processing Short ${short.id || "unknown"}: ${error.message}`,
            {
              videoId: short.id,
              videoTitle: short.snippet?.title,
              errorMessage: error.message,
              stack: error.stack,
            },
          );

          // Continue processing other Shorts even if one fails
          continue;
        }
      }

      this.logger.log(
        `Shorts collection completed. Processed: ${processedCount}, Errors: ${errorCount}, Total: ${trendingShorts.length}`,
      );
    } catch (error) {
      this.logger.error("Critical error in Shorts data collection", {
        message: error.message,
        stack: error.stack,
      });
    }
  }

  /**
   * Get recent videos from database when YouTube API is unavailable
   */
  private async getRecentVideosFromDatabase(): Promise<any[]> {
    try {
      // Get recent videos from the last 24 hours
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const recentVideos = await this.videoAnalyticsModel
        .find({
          publishedAt: { $gte: oneDayAgo },
        })
        .sort({ publishedAt: -1 })
        .limit(50)
        .lean();

      this.logger.log(
        `Retrieved ${recentVideos.length} recent videos from database`,
      );
      return recentVideos;
    } catch (error) {
      this.logger.error("Error getting recent videos from database:", error);
      return [];
    }
  }

  /**
   * Enhanced method to get trending Shorts with multiple fallback strategies
   */
  private async getTrendingShortsWithFallbacks(): Promise<any[]> {
    try {
      this.logger.log("Using comprehensive Shorts collection strategy...");

      // Use the new comprehensive method that combines multiple strategies
      const shorts = await this.youtubeService.getComprehensiveShorts(
        this.systemUserIdObject, // Use ObjectId version
        this.maxVideosPerRun,
        {
          regionCode: "US",
          timeRange: "day",
          minViews: 1000,
          useSearch: true,
          useTrending: true,
          usePlaylists: false, // Disable playlists to avoid too many API calls
        },
      );

      if (shorts && shorts.length > 0) {
        this.logger.log(
          `Successfully retrieved ${shorts.length} Shorts using comprehensive strategy`,
        );
        return shorts;
      }

      // Fallback: get trending videos and filter for Shorts
      this.logger.log(
        "Comprehensive strategy failed, trying trending videos fallback...",
      );
      // Remove getTrendingVideos call - return empty array for now
      this.logger.warn(
        "getTrendingVideos method removed - returning empty array",
      );
      return [];
    } catch (error) {
      this.logger.error("Comprehensive Shorts collection failed:", error);
    }

    this.logger.error("All Shorts fetching strategies failed");
    return [];
  }

  /**
   * Fallback method using search to get popular recent videos
   */
  private async getPopularVideosViaSearch(): Promise<any[]> {
    try {
      // This would need to be implemented in your YouTube service
      // For now, return empty array
      this.logger.warn("Search fallback not fully implemented yet");
      return [];
    } catch (error) {
      this.logger.error("Search fallback failed:", error);
      return [];
    }
  }

  private async processVideo(videoData: any) {
    try {
      // Handle both standard video data and ShortsMetricsDto structure
      const videoId =
        videoData.videoId || videoData.id?.videoId || videoData.id;

      if (!videoId) {
        this.logger.warn(
          "Invalid video data provided to processVideo - missing video ID",
          {
            data: JSON.stringify(videoData),
          },
        );
        return;
      }

      const existingVideo =
        await this.analyticsService.getVideoAnalytics(videoId);

      if (existingVideo) {
        await this.updateVideoMetrics(existingVideo);
        return;
      }

      // Enhanced video analytics creation with better error handling
      const duration =
        videoData.duration ||
        this.parseDuration(videoData.contentDetails?.duration);
      const isShorts = videoData.isShorts || (duration > 0 && duration <= 60); // Mark as Shorts if duration <= 60 seconds

      const videoAnalytics: Partial<VideoAnalytics> = {
        videoId,
        userId: this.systemUserIdObject, // Use system user ID for videos collected by the worker
        title: videoData.title || videoData.snippet?.title || "Unknown Title",
        description:
          videoData.description || videoData.snippet?.description || "",
        publishedAt: new Date(
          videoData.publishedAt || videoData.snippet?.publishedAt || Date.now(),
        ),
        channelId: videoData.channelId || videoData.snippet?.channelId || "",
        channelTitle:
          videoData.channelTitle ||
          videoData.snippet?.channelTitle ||
          "Unknown Channel",
        thumbnailUrl:
          videoData.thumbnailUrl ||
          videoData.snippet?.thumbnails?.high?.url ||
          "",
        duration,
        viewCount: parseInt(
          videoData.viewCount || videoData.statistics?.viewCount || "0",
        ),
        likeCount: parseInt(
          videoData.likeCount || videoData.statistics?.likeCount || "0",
        ),
        commentCount: parseInt(
          videoData.commentCount || videoData.statistics?.commentCount || "0",
        ),
        tags: videoData.snippet?.tags || [],
        categoryId: videoData.snippet?.categoryId || "",
        isShorts,
      };

      // Categorize video with error handling
      try {
        // Remove niche categorization for now - set to unknown
        videoAnalytics.niche = "unknown";
      } catch (error) {
        this.logger.warn(
          `Failed to categorize video ${videoId}: ${error.message}`,
        );
        videoAnalytics.niche = "unknown";
      }

      // Calculate metrics with safe defaults
      const engagementData = {
        viewCount: videoAnalytics.viewCount || 0,
        likeCount: videoAnalytics.likeCount || 0,
        commentCount: videoAnalytics.commentCount || 0,
      };
      videoAnalytics.engagementRate =
        this.calculateEngagementRate(engagementData);

      try {
        // Save the video analytics
        const savedVideo =
          await this.analyticsService.saveVideoAnalytics(videoAnalytics);

        if (!savedVideo) {
          this.logger.error(
            `Failed to save video ${videoAnalytics.videoId} to analytics service`,
          );
          return;
        }

        // Calculate virality score separately with error handling
        try {
          const viralityScore =
            await this.analyticsService.calculateViralityScore(
              savedVideo.videoId,
            );
          savedVideo.viralityScore = viralityScore.score;
          await savedVideo.save();
        } catch (viralityError) {
          this.logger.warn(
            `Error calculating virality score for video ${savedVideo.videoId}:`,
            viralityError.message,
          );
          // Continue without virality score
        }

        // Write metrics to MongoDB with error handling
        try {
          await this.writeMetricsToMongoDB(savedVideo);
        } catch (metricsError) {
          this.logger.warn(
            `Failed to write metrics to MongoDB for video ${savedVideo.videoId}:`,
            metricsError.message,
          );
          // Continue even if metrics writing fails
        }
      } catch (saveError) {
        this.logger.error(
          `Critical error saving video ${videoAnalytics.videoId}:`,
          saveError,
        );
        throw saveError; // Re-throw critical save errors
      }
    } catch (error) {
      const errorVideoId =
        videoData.videoId || videoData.id?.videoId || videoData.id || "unknown";
      this.logger.error(`Error in processVideo for ${errorVideoId}:`, {
        error: error.message,
        stack: error.stack,
        videoId: errorVideoId,
      });
      throw error;
    }
  }

  private async updateVideoMetrics(video: VideoAnalytics) {
    const videoId = video.videoId;

    // Get updated metrics from YouTube API
    const videoData = await this.youtubeService.getVideoDetails(
      videoId,
      video.userId,
    );

    // Update metrics
    const updates = {
      viewCount: parseInt(videoData.statistics?.viewCount || "0"),
      likeCount: parseInt(videoData.statistics?.likeCount || "0"),
      commentCount: parseInt(videoData.statistics?.commentCount || "0"),
      updatedAt: new Date(),
    };

    // Create a plain object with required properties for engagement rate calculation
    const engagementData = {
      viewCount: video.viewCount || 0,
      likeCount: video.likeCount || 0,
      commentCount: video.commentCount || 0,
      ...updates,
    };

    // Calculate new engagement rate with properly typed data
    updates["engagementRate"] = this.calculateEngagementRate(engagementData);

    await this.analyticsService.updateVideoAnalytics(videoId, updates);

    // Create a new object with all video properties and updates for metrics
    const metricsData = {
      ...video,
      ...updates,
    } as VideoAnalytics;

    // Write metrics to MongoDB
    await this.writeMetricsToMongoDB(metricsData);
  }

  private async collectMetrics() {
    this.logger.log("Starting metrics collection");
    try {
      // Get videos that need metrics update (prioritize newer and more popular videos)
      const videos = await this.analyticsService.getVideosForMetricsUpdate(
        this.maxVideosPerRun,
      );

      for (const video of videos) {
        try {
          await this.updateVideoMetrics(video);
          // Small delay to avoid rate limiting
          await new Promise((resolve) => setTimeout(resolve, 200));
        } catch (error) {
          this.logger.error(
            `Error updating metrics for video ${video.videoId}: ${error.message}`,
            error.stack,
          );
        }
      }

      this.logger.log(`Updated metrics for ${videos.length} videos`);
    } catch (error) {
      this.logger.error("Error in metrics collection", error.stack);
    }
  }

  private async writeMetricsToMongoDB(video: VideoAnalytics) {
    try {
      await this.metricsService.writeMetric(
        "youtube_video_metrics",
        {
          videoId: video.videoId,
          channelId: video.channelId,
          niche: video.niche || "unknown",
        },
        {
          views: video.viewCount || 0,
          likes: video.likeCount || 0,
          comments: video.commentCount || 0,
          engagementRate: video.engagementRate || 0,
          viralityScore: video.viralityScore || 0,
        },
        new Date(),
      );
    } catch (error) {
      this.logger.error(
        `Failed to write metrics to MongoDB for video ${video.videoId}: ${error.message}`,
        error.stack,
      );
    }
  }

  private calculateEngagementRate(video: {
    viewCount: number;
    likeCount: number;
    commentCount: number;
  }): number {
    if (!video.viewCount) return 0;
    return ((video.likeCount + video.commentCount * 2) / video.viewCount) * 100;
  }

  private parseDuration(duration: string): number {
    if (!duration) return 0;

    // Parse ISO 8601 duration format (e.g., PT1H2M3S)
    const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
    if (!match) return 0;

    const hours = parseInt(match[1]) || 0;
    const minutes = parseInt(match[2]) || 0;
    const seconds = parseInt(match[3]) || 0;

    return hours * 3600 + minutes * 60 + seconds;
  }
}
