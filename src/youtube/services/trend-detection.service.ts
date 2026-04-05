import { Injectable, Logger } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { VideoAnalytics } from "../schemas/video-analytics.schema";
import { Cron, CronExpression } from "@nestjs/schedule";

@Injectable()
export class TrendDetectionService {
  private readonly logger = new Logger(TrendDetectionService.name);
  private readonly commonWords = new Set([
    "the",
    "and",
    "for",
    "with",
    "this",
    "that",
    "you",
    "are",
    "was",
    "were",
  ]);

  constructor(
    @InjectModel("VideoAnalytics") private videoModel: Model<VideoAnalytics>,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async analyzeTrendingContent() {
    this.logger.log("Starting trend analysis...");
    try {
      const recentVideos = await this.getRecentPopularVideos();
      if (recentVideos.length === 0) {
        this.logger.warn("No recent videos found");
        return;
      }
      return {
        hashtags: this.analyzeHashtags(recentVideos),
        topics: this.analyzeTopics(recentVideos),
      };
    } catch (error) {
      this.logger.error("Trend analysis failed", error.stack);
      throw error;
    }
  }

  private async getRecentPopularVideos() {
    return this.videoModel
      .find({
        publishedAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        viewCount: { $gt: 1000 },
      })
      .sort({ viewCount: -1 })
      .limit(1000)
      .lean();
  }

  private analyzeHashtags(videos: any[]) {
    const hashtagData = new Map<
      string,
      { count: number; engagement: number }
    >();

    videos.forEach((video) => {
      const engagement =
        (video.likeCount + video.commentCount) / Math.max(video.viewCount, 1);
      video.hashtags?.forEach((tag: string) => {
        const normalizedTag = tag.toLowerCase();
        const data = hashtagData.get(normalizedTag) || {
          count: 0,
          engagement: 0,
        };
        data.count++;
        data.engagement += engagement;
        hashtagData.set(normalizedTag, data);
      });
    });

    return Array.from(hashtagData.entries())
      .map(([tag, { count, engagement }]) => ({
        tag,
        count,
        avgEngagement: engagement / count,
        score: count * Math.log(engagement + 1), // Simple scoring
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 50);
  }

  private analyzeTopics(videos: any[]) {
    const wordCounts = new Map<string, number>();

    videos.forEach((video) => {
      const text = `${video.title} ${video.description || ""}`.toLowerCase();
      const words = text.split(/\s+/);

      words.forEach((word) => {
        if (word.length > 3 && !this.commonWords.has(word)) {
          wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
        }
      });
    });

    return Array.from(wordCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 50)
      .map(([word, count]) => ({ word, count }));
  }
}
