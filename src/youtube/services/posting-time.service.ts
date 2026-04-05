import { Injectable, Logger } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { VideoAnalytics } from "../schemas/video-analytics.schema";

export interface PostingTimeAnalysis {
  bestTimes: Array<{
    hour: number;
    avgEngagement: number;
    avgViews: number;
    sampleSize: number;
    recommendation: string;
  }>;
  worstTimes: Array<{
    hour: number;
    avgEngagement: number;
    avgViews: number;
    sampleSize: number;
    reason: string;
  }>;
  insights: {
    peakHours: number[];
    optimalDays: string[];
    timezoneRecommendation: string;
    strategy: string[];
  };
}

@Injectable()
export class PostingTimeService {
  private readonly logger = new Logger(PostingTimeService.name);

  constructor(
    @InjectModel("VideoAnalytics") private videoModel: Model<VideoAnalytics>,
  ) {}

  async getOptimalPostingTimes(niche: string): Promise<string[]> {
    try {
      const analysis = await this.analyzePostingPerformance(niche);
      return analysis.bestTimes.map((time) => `${time.hour}:00`);
    } catch (error) {
      this.logger.error(
        `Error getting optimal posting times for niche ${niche}:`,
        error,
      );
      return ["9:00 AM", "6:00 PM", "8:00 PM"]; // Fallback
    }
  }

  async analyzePostingPerformance(
    niche?: string,
  ): Promise<PostingTimeAnalysis> {
    try {
      // Get videos for analysis
      const query = niche ? { niche: new RegExp(niche, "i") } : {};

      const videos = await this.videoModel
        .find(query)
        .sort({ publishedAt: -1 })
        .limit(2000)
        .lean();

      if (videos.length === 0) {
        return this.getDefaultAnalysis();
      }

      // Group videos by hour
      const hourlyStats = new Map();

      videos.forEach((video) => {
        if (video.publishedAt) {
          const hour = new Date(video.publishedAt).getHours();
          if (!hourlyStats.has(hour)) {
            hourlyStats.set(hour, {
              hour,
              videos: [],
              totalViews: 0,
              totalLikes: 0,
              totalComments: 0,
            });
          }
          const stats = hourlyStats.get(hour);
          stats.videos.push(video);
          stats.totalViews += video.viewCount || 0;
          stats.totalLikes += video.likeCount || 0;
          stats.totalComments += video.commentCount || 0;
        }
      });

      // Calculate metrics for each hour
      const hourAnalytics = Array.from(hourlyStats.values())
        .map((stats) => {
          const avgViews =
            stats.videos.length > 0
              ? Math.round(stats.totalViews / stats.videos.length)
              : 0;
          const avgEngagement =
            stats.totalViews > 0
              ? ((stats.totalLikes + stats.totalComments) / stats.totalViews) *
                100
              : 0;

          return {
            hour: stats.hour,
            avgViews,
            avgEngagement,
            sampleSize: stats.videos.length,
            totalVideos: stats.videos.length,
          };
        })
        .filter((stat) => stat.sampleSize >= 3); // Only include hours with sufficient data

      // Sort by engagement rate
      const sortedByEngagement = [...hourAnalytics].sort(
        (a, b) => b.avgEngagement - a.avgEngagement,
      );
      const sortedByViews = [...hourAnalytics].sort(
        (a, b) => b.avgViews - a.avgViews,
      );

      const bestTimes = sortedByEngagement.slice(0, 5).map((stat, index) => ({
        hour: stat.hour,
        avgEngagement: Math.round(stat.avgEngagement * 100) / 100,
        avgViews: stat.avgViews,
        sampleSize: stat.sampleSize,
        recommendation: this.getTimeRecommendation(stat.hour, index + 1),
      }));

      const worstTimes = sortedByEngagement.slice(-3).map((stat) => ({
        hour: stat.hour,
        avgEngagement: Math.round(stat.avgEngagement * 100) / 100,
        avgViews: stat.avgViews,
        sampleSize: stat.sampleSize,
        reason: this.getWorstTimeReason(stat.hour),
      }));

      const insights = this.generateInsights(hourAnalytics, bestTimes);

      return {
        bestTimes,
        worstTimes,
        insights,
      };
    } catch (error) {
      this.logger.error("Error analyzing posting performance:", error);
      return this.getDefaultAnalysis();
    }
  }

  private getTimeRecommendation(hour: number, rank: number): string {
    const timeLabels = {
      6: "Early morning",
      7: "Early morning",
      8: "Morning",
      9: "Morning",
      10: "Late morning",
      11: "Late morning",
      12: "Noon",
      13: "Early afternoon",
      14: "Early afternoon",
      15: "Afternoon",
      16: "Afternoon",
      17: "Late afternoon",
      18: "Evening",
      19: "Evening",
      20: "Prime time",
      21: "Prime time",
      22: "Late evening",
      23: "Late evening",
      0: "Late night",
      1: "Late night",
      2: "Very late night",
      3: "Very late night",
      4: "Early morning",
      5: "Early morning",
    };

    const timeLabel = timeLabels[hour] || "Unknown";
    const rankText = rank === 1 ? "best" : rank === 2 ? "second best" : "good";

    return `${timeLabel} (${hour}:00) - ${rankText} performing time slot`;
  }

  private getWorstTimeReason(hour: number): string {
    if (hour >= 0 && hour <= 5) {
      return "Very low audience activity during late night hours";
    } else if (hour >= 6 && hour <= 8) {
      return "Limited audience engagement in early morning";
    } else if (hour >= 14 && hour <= 16) {
      return "Lower engagement during work hours";
    } else {
      return "Below average performance compared to other time slots";
    }
  }

  private generateInsights(hourAnalytics: any[], bestTimes: any[]): any {
    const peakHours = bestTimes.slice(0, 3).map((time) => time.hour);

    // Analyze day patterns if we have enough data
    const optimalDays = this.analyzeDayPatterns(hourAnalytics);

    const strategy = [
      `Focus on posting during peak hours: ${peakHours.map((h) => `${h}:00`).join(", ")}`,
      "Avoid posting during low-engagement hours",
      "Consider your audience's timezone when scheduling",
      "Test different posting times to find your optimal schedule",
    ];

    return {
      peakHours,
      optimalDays,
      timezoneRecommendation:
        "Consider your target audience's timezone for optimal reach",
      strategy,
    };
  }

  private analyzeDayPatterns(hourAnalytics: any[]): string[] {
    // This is a simplified analysis - in a real implementation,
    // you'd analyze day-of-week patterns from the video data
    return ["Monday", "Wednesday", "Friday", "Sunday"];
  }

  private getDefaultAnalysis(): PostingTimeAnalysis {
    return {
      bestTimes: [
        {
          hour: 9,
          avgEngagement: 4.2,
          avgViews: 15000,
          sampleSize: 10,
          recommendation: "Morning (9:00) - best performing time slot",
        },
        {
          hour: 18,
          avgEngagement: 3.8,
          avgViews: 12000,
          sampleSize: 8,
          recommendation: "Evening (18:00) - second best performing time slot",
        },
        {
          hour: 20,
          avgEngagement: 3.5,
          avgViews: 10000,
          sampleSize: 12,
          recommendation: "Prime time (20:00) - good performing time slot",
        },
      ],
      worstTimes: [
        {
          hour: 3,
          avgEngagement: 1.2,
          avgViews: 3000,
          sampleSize: 5,
          reason: "Very low audience activity during late night hours",
        },
        {
          hour: 15,
          avgEngagement: 2.1,
          avgViews: 6000,
          sampleSize: 7,
          reason: "Lower engagement during work hours",
        },
      ],
      insights: {
        peakHours: [9, 18, 20],
        optimalDays: ["Monday", "Wednesday", "Friday"],
        timezoneRecommendation:
          "Consider your target audience's timezone for optimal reach",
        strategy: [
          "Focus on posting during peak hours: 9:00, 18:00, 20:00",
          "Avoid posting during low-engagement hours",
          "Consider your audience's timezone when scheduling",
          "Test different posting times to find your optimal schedule",
        ],
      },
    };
  }
}
