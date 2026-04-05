import { Injectable, Logger } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { VideoAnalytics } from "../schemas/video-analytics.schema";

export interface CrossNicheComparison {
  comparisonDate: Date;
  niches: Array<{
    niche: string;
    metrics: {
      totalVideos: number;
      totalViews: number;
      avgEngagementRate: number;
      avgViralityScore: number;
      growthRate: number;
      topPerformingHashtags: string[];
    };
    performance: {
      rank: number;
      score: number;
      strengths: string[];
      weaknesses: string[];
    };
  }>;
  insights: {
    fastestGrowingNiche: string;
    highestEngagementNiche: string;
    mostCompetitiveNiche: string;
    emergingOpportunities: string[];
    recommendations: string[];
  };
}

@Injectable()
export class CrossNicheComparisonService {
  private readonly logger = new Logger(CrossNicheComparisonService.name);

  constructor(
    @InjectModel("VideoAnalytics") private videoModel: Model<VideoAnalytics>,
  ) {}

  async compareNiches(niches: string[]): Promise<CrossNicheComparison> {
    try {
      const nicheAnalyses = await Promise.all(
        niches.map((niche) => this.analyzeNichePerformance(niche)),
      );

      const rankedNiches = this.rankNiches(nicheAnalyses);
      const insights = this.generateInsights(rankedNiches);

      return {
        comparisonDate: new Date(),
        niches: rankedNiches,
        insights,
      };
    } catch (error) {
      this.logger.error("Error comparing niches:", error);
      throw error;
    }
  }

  private async analyzeNichePerformance(niche: string) {
    const videos = await this.videoModel
      .find({ niche: new RegExp(niche, "i") })
      .sort({ publishedAt: -1 })
      .limit(1000)
      .lean();

    if (videos.length === 0) {
      return {
        niche,
        metrics: {
          totalVideos: 0,
          totalViews: 0,
          avgEngagementRate: 0,
          avgViralityScore: 0,
          growthRate: 0,
          topPerformingHashtags: [],
        },
      };
    }

    const totalViews = videos.reduce((sum, v) => sum + (v.viewCount || 0), 0);
    const totalLikes = videos.reduce((sum, v) => sum + (v.likeCount || 0), 0);
    const totalComments = videos.reduce(
      (sum, v) => sum + (v.commentCount || 0),
      0,
    );
    const avgEngagementRate =
      totalViews > 0 ? ((totalLikes + totalComments) / totalViews) * 100 : 0;
    const avgViralityScore =
      videos.reduce((sum, v) => sum + (v.viralityScore || 0), 0) /
      videos.length;

    // Calculate growth rate (recent vs older videos)
    const recentVideos = videos.filter((v) => {
      const age = Date.now() - new Date(v.publishedAt).getTime();
      return age <= 7 * 24 * 60 * 60 * 1000; // Last 7 days
    });
    const olderVideos = videos.filter((v) => {
      const age = Date.now() - new Date(v.publishedAt).getTime();
      return age > 7 * 24 * 60 * 60 * 1000 && age <= 14 * 24 * 60 * 60 * 1000; // 7-14 days ago
    });

    const recentAvgViews =
      recentVideos.length > 0
        ? recentVideos.reduce((sum, v) => sum + (v.viewCount || 0), 0) /
          recentVideos.length
        : 0;
    const olderAvgViews =
      olderVideos.length > 0
        ? olderVideos.reduce((sum, v) => sum + (v.viewCount || 0), 0) /
          olderVideos.length
        : 0;

    const growthRate =
      olderAvgViews > 0
        ? ((recentAvgViews - olderAvgViews) / olderAvgViews) * 100
        : recentAvgViews > 0
          ? 100
          : 0;

    // Extract top hashtags
    const hashtagStats = new Map();
    videos.forEach((video) => {
      const hashtags = [
        ...this.extractHashtags(video.title || ""),
        ...this.extractHashtags(video.description || ""),
        ...(video.hashtags || []),
      ];

      hashtags.forEach((hashtag) => {
        const count = hashtagStats.get(hashtag) || 0;
        hashtagStats.set(hashtag, count + 1);
      });
    });

    const topPerformingHashtags = Array.from(hashtagStats.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([hashtag]) => hashtag);

    return {
      niche,
      metrics: {
        totalVideos: videos.length,
        totalViews,
        avgEngagementRate,
        avgViralityScore,
        growthRate,
        topPerformingHashtags,
      },
    };
  }

  private rankNiches(nicheAnalyses: any[]) {
    // Calculate performance score for each niche
    const scoredNiches = nicheAnalyses.map((analysis) => {
      const { metrics } = analysis;

      // Normalize metrics to 0-100 scale
      const engagementScore = Math.min(100, metrics.avgEngagementRate * 10);
      const viralityScore = Math.min(100, metrics.avgViralityScore);
      const growthScore = Math.min(100, Math.max(0, metrics.growthRate + 50));
      const volumeScore = Math.min(100, (metrics.totalVideos / 100) * 100);

      // Weighted score
      const score =
        engagementScore * 0.3 +
        viralityScore * 0.25 +
        growthScore * 0.25 +
        volumeScore * 0.2;

      return {
        ...analysis,
        performance: {
          score: Math.round(score * 100) / 100,
          strengths: this.identifyStrengths(metrics),
          weaknesses: this.identifyWeaknesses(metrics),
        },
      };
    });

    // Rank by score
    return scoredNiches
      .sort((a, b) => b.performance.score - a.performance.score)
      .map((niche, index) => ({
        ...niche,
        performance: {
          ...niche.performance,
          rank: index + 1,
        },
      }));
  }

  private identifyStrengths(metrics: any): string[] {
    const strengths = [];

    if (metrics.avgEngagementRate > 5) {
      strengths.push("High audience engagement");
    }
    if (metrics.avgViralityScore > 70) {
      strengths.push("Strong viral potential");
    }
    if (metrics.growthRate > 20) {
      strengths.push("Rapid growth trend");
    }
    if (metrics.totalVideos > 500) {
      strengths.push("Large content volume");
    }

    return strengths.length > 0 ? strengths : ["Balanced performance"];
  }

  private identifyWeaknesses(metrics: any): string[] {
    const weaknesses = [];

    if (metrics.avgEngagementRate < 2) {
      weaknesses.push("Low engagement rates");
    }
    if (metrics.avgViralityScore < 40) {
      weaknesses.push("Limited viral potential");
    }
    if (metrics.growthRate < -10) {
      weaknesses.push("Declining performance");
    }
    if (metrics.totalVideos < 100) {
      weaknesses.push("Limited content volume");
    }

    return weaknesses.length > 0 ? weaknesses : ["No major weaknesses"];
  }

  private generateInsights(rankedNiches: any[]) {
    const fastestGrowing = rankedNiches.reduce((max, niche) =>
      niche.metrics.growthRate > max.metrics.growthRate ? niche : max,
    );

    const highestEngagement = rankedNiches.reduce((max, niche) =>
      niche.metrics.avgEngagementRate > max.metrics.avgEngagementRate
        ? niche
        : max,
    );

    const mostCompetitive = rankedNiches.reduce((max, niche) =>
      niche.metrics.totalVideos > max.metrics.totalVideos ? niche : max,
    );

    const emergingOpportunities = rankedNiches
      .filter(
        (niche) =>
          niche.metrics.growthRate > 10 && niche.metrics.totalVideos < 300,
      )
      .map((niche) => niche.niche);

    const recommendations = this.generateRecommendations(rankedNiches);

    return {
      fastestGrowingNiche: fastestGrowing.niche,
      highestEngagementNiche: highestEngagement.niche,
      mostCompetitiveNiche: mostCompetitive.niche,
      emergingOpportunities,
      recommendations,
    };
  }

  private generateRecommendations(rankedNiches: any[]): string[] {
    const recommendations = [];

    // Top performer insights
    const topNiche = rankedNiches[0];
    if (topNiche) {
      recommendations.push(
        `Focus on ${topNiche.niche} - highest overall performance`,
      );
    }

    // Growth opportunities
    const growingNiches = rankedNiches.filter((n) => n.metrics.growthRate > 15);
    if (growingNiches.length > 0) {
      recommendations.push(
        `Consider expanding into ${growingNiches[0].niche} - strong growth trend`,
      );
    }

    // Engagement opportunities
    const highEngagementNiches = rankedNiches.filter(
      (n) => n.metrics.avgEngagementRate > 4,
    );
    if (highEngagementNiches.length > 0) {
      recommendations.push(
        `Study ${highEngagementNiches[0].niche} for engagement strategies`,
      );
    }

    return recommendations;
  }

  private extractHashtags(text: string): string[] {
    const hashtagRegex = /#[\w\u0590-\u05ff]+/g;
    return text.match(hashtagRegex) || [];
  }
}
