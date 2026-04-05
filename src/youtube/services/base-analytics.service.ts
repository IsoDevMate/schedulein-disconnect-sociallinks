import { Injectable, Logger } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { VideoAnalytics } from "../schemas/video-analytics.schema";
import { IAnalyticsService, IViralityScore } from "./analytics.interface";

@Injectable()
export abstract class BaseAnalyticsService implements IAnalyticsService {
  protected readonly logger = new Logger(BaseAnalyticsService.name);

  constructor(
    @InjectModel("VideoAnalytics") protected videoModel: Model<VideoAnalytics>,
  ) {}

  async calculateViralityScore(videoId: string): Promise<IViralityScore> {
    const video = await this.videoModel.findOne({ videoId });
    if (!video) throw new Error("Video not found");

    const channelMetrics = await this.getChannelMetrics(video.channelId);
    const baseScore =
      video.viewCount / Math.max(channelMetrics.subscriberCount, 1000);
    const engagementRate = this.calculateEngagementRate(video);
    const recencyFactor = this.calculateRecencyFactor(video.publishedAt);
    const durationFactor = this.calculateDurationFactor(
      video.duration,
      video.isShorts,
    );

    const viralityScore = this.calculateFinalScore({
      baseScore,
      engagementRate,
      recencyFactor,
      durationFactor,
      isShorts: video.isShorts,
    });

    video.viralityScore = viralityScore;
    await video.save();

    return {
      videoId,
      score: viralityScore,
      metrics: {
        baseScore,
        engagementRate,
        recencyFactor,
        durationFactor,
        isShorts: video.isShorts,
      },
      timestamp: new Date(),
    };
  }

  // Helper methods
  protected calculateEngagementRate(video: any): number {
    return (
      (video.likeCount + video.commentCount) / Math.max(video.viewCount, 1)
    );
  }

  protected calculateRecencyFactor(publishedAt: Date): number {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    return Math.max(
      0,
      1 - (Date.now() - publishedAt.getTime()) / (7 * 24 * 60 * 60 * 1000),
    );
  }

  protected calculateDurationFactor(
    duration: number,
    isShorts: boolean,
  ): number {
    return isShorts ? Math.max(0, 1 - Math.abs(22.5 - duration) / 22.5) : 0.5;
  }

  protected calculateFinalScore(params: {
    baseScore: number;
    engagementRate: number;
    recencyFactor: number;
    durationFactor: number;
    isShorts: boolean;
  }): number {
    const {
      baseScore,
      engagementRate,
      recencyFactor,
      durationFactor,
      isShorts,
    } = params;

    // Normalize baseScore to be between 0-1 (assuming typical range)
    const normalizedBaseScore = Math.min(1, baseScore / 10);

    // Normalize engagement rate to be between 0-1 (assuming it's a percentage)
    const normalizedEngagement = Math.min(1, engagementRate / 100);

    // Calculate weighted score (weights sum to 1.0)
    const weightedScore =
      normalizedBaseScore * 0.4 +
      normalizedEngagement * 0.3 +
      recencyFactor * 0.2 +
      durationFactor * 0.1;

    // Apply Shorts bonus (10%)
    const finalScore = weightedScore * (isShorts ? 1.1 : 1);

    // Scale to 0-100 range and round to nearest integer
    return Math.round(Math.min(100, Math.max(0, finalScore * 100)));
  }

  protected getDateRangeFilter(timeRange: string): Date {
    const now = new Date();
    const ranges = {
      "24h": 24 * 60 * 60 * 1000,
      "7d": 7 * 24 * 60 * 60 * 1000,
      "30d": 30 * 24 * 60 * 60 * 1000,
    };
    return new Date(now.getTime() - (ranges[timeRange] || ranges["7d"]));
  }

  protected async getChannelMetrics(
    _channelId: string,
  ): Promise<{ subscriberCount: number }> {
    // In a real implementation, fetch from your database or YouTube API
    return { subscriberCount: 10000 }; // Default value
  }

  abstract analyzeTrends(timeRange: "24h" | "7d" | "30d"): Promise<any>;
  abstract analyzeNiche(niche: string): Promise<any>;
  abstract generateContentIdeas(niche: string, count?: number): Promise<any[]>;
}
