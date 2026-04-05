import { Injectable, Logger } from '@nestjs/common';
import { VideoInfo, KeywordAnalysis, KeywordData } from '../interfaces/profile-scout.interface';

@Injectable()
export class KeywordAnalyzerService {
  private readonly logger = new Logger(KeywordAnalyzerService.name);

  /**
   * Analyze keywords from video data
   */
  async analyzeKeywords(videos: VideoInfo[]): Promise<KeywordAnalysis> {
    try {
      this.logger.log(`Analyzing keywords from ${videos.length} videos`);

      // Extract all text content
      const allText = videos.map(video =>
        `${video.title} ${video.description}`.toLowerCase()
      ).join(' ');

      // Extract keywords (words, hashtags, mentions)
      const keywords = this.extractKeywords(allText);

      // Calculate keyword performance
      const keywordPerformance = this.calculateKeywordPerformance(videos, keywords);

      // Generate recommendations
      const recommendations = this.generateRecommendations(keywordPerformance);

      // Generate reconsiderations
      const reconsiderations = this.generateReconsiderations(keywordPerformance);

      return {
        topPerforming: keywordPerformance.topPerforming,
        mostViewed: keywordPerformance.mostViewed,
        recommended: recommendations,
        toReconsider: reconsiderations,
      };
    } catch (error) {
      this.logger.error('Error analyzing keywords:', error);
      throw error;
    }
  }

  /**
   * Extract keywords from text content
   */
  private extractKeywords(text: string): string[] {
                // Extract hashtags
      const hashtags: string[] = text.match(/#\w+/g) || [];

      // Extract mentions
      const mentions: string[] = text.match(/@\w+/g) || [];

      // Extract common words (filter out common stop words)
      const words = text
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(word =>
          word.length > 2 &&
          !this.isStopWord(word) &&
          !hashtags.includes(`#${word}`) &&
          !mentions.includes(`@${word}`)
        );

    // Combine all keywords
    const allKeywords = [
      ...hashtags.map(tag => tag.toLowerCase()),
      ...mentions.map(mention => mention.toLowerCase()),
      ...words.map(word => word.toLowerCase())
    ];

    // Remove duplicates and return
    return [...new Set(allKeywords)];
  }

  /**
   * Calculate performance metrics for each keyword
   */
  private calculateKeywordPerformance(videos: VideoInfo[], keywords: string[]): {
    topPerforming: KeywordData[];
    mostViewed: KeywordData[];
  } {
    const keywordStats: Map<string, {
      views: number;
      videos: number;
      engagement: number;
      totalViews: number;
    }> = new Map();

    // Calculate stats for each keyword
    keywords.forEach(keyword => {
      let totalViews = 0;
      let totalEngagement = 0;
      let videoCount = 0;

      videos.forEach(video => {
        const videoText = `${video.title} ${video.description}`.toLowerCase();
        if (videoText.includes(keyword.toLowerCase())) {
          totalViews += video.views;
          totalEngagement += video.engagementRate;
          videoCount++;
        }
      });

      if (videoCount > 0) {
        keywordStats.set(keyword, {
          views: totalViews,
          videos: videoCount,
          engagement: totalEngagement / videoCount,
          totalViews: totalViews,
        });
      }
    });

    // Convert to arrays and sort
    const keywordData: KeywordData[] = Array.from(keywordStats.entries()).map(([keyword, stats]) => ({
      keyword,
      views: stats.views,
      videos: stats.videos,
      engagement: stats.engagement,
      averageViews: stats.totalViews / stats.videos,
    }));

    return {
      topPerforming: keywordData
        .filter(k => k.videos >= 2) // Only keywords used in multiple videos
        .sort((a, b) => b.engagement - a.engagement)
        .slice(0, 10),
      mostViewed: keywordData
        .filter(k => k.videos >= 2)
        .sort((a, b) => b.averageViews - a.averageViews)
        .slice(0, 10),
    };
  }

  /**
   * Generate sophisticated keyword recommendations
   */
  private generateRecommendations(keywordPerformance: {
    topPerforming: KeywordData[];
    mostViewed: KeywordData[];
  }): Array<{ keyword: string; engagementRate: number; reason: string }> {
    const recommendations: Array<{ keyword: string; engagementRate: number; reason: string }> = [];

    // Analyze keyword patterns for better recommendations
    const topPerforming = keywordPerformance.topPerforming;
    const mostViewed = keywordPerformance.mostViewed;

    // Calculate average engagement rate for context
    const avgEngagement = topPerforming.reduce((sum, k) => sum + k.engagement, 0) / topPerforming.length;

    // Recommend keywords that are both high-performing AND trending
    const trendingHighPerformers = topPerforming.filter(k =>
      mostViewed.some(mv => mv.keyword === k.keyword) && k.engagement > avgEngagement * 1.2
    );

    // Add trending high performers first
    trendingHighPerformers.slice(0, 3).forEach(keyword => {
      const viewsData = mostViewed.find(mv => mv.keyword === keyword.keyword);
      recommendations.push({
        keyword: keyword.keyword,
        engagementRate: keyword.engagement,
        reason: `"${keyword.keyword}" is trending (${viewsData?.views.toLocaleString()} total views) with ${keyword.engagement.toFixed(1)}% engagement - perfect for viral content`,
      });
    });

    // Add remaining high performers with context
    const remaining = topPerforming.filter(k => !trendingHighPerformers.includes(k)).slice(0, 2);
    remaining.forEach(keyword => {
      const performanceLevel = keyword.engagement > avgEngagement * 1.5 ? 'excellent' : 'good';
      recommendations.push({
        keyword: keyword.keyword,
        engagementRate: keyword.engagement,
        reason: `"${keyword.keyword}" shows ${performanceLevel} performance (${keyword.engagement.toFixed(1)}% engagement) - consider using more frequently`,
      });
    });

    return recommendations;
  }

  /**
   * Generate sophisticated keyword reconsiderations
   */
  private generateReconsiderations(keywordPerformance: {
    topPerforming: KeywordData[];
    mostViewed: KeywordData[];
  }): Array<{ keyword: string; performance: number; reason: string }> {
    const reconsiderations: Array<{ keyword: string; performance: number; reason: string }> = [];

    // Calculate averages for context
    const avgEngagement = keywordPerformance.topPerforming.reduce((sum, k) => sum + k.engagement, 0) / keywordPerformance.topPerforming.length;
    const avgViews = keywordPerformance.mostViewed.reduce((sum, k) => sum + k.views, 0) / keywordPerformance.mostViewed.length;

    // Find keywords that are underperforming relative to their view count
    const underperformingKeywords = keywordPerformance.mostViewed.filter(keyword => {
      const topPerformingKeyword = keywordPerformance.topPerforming.find(tp => tp.keyword === keyword.keyword);
      if (!topPerformingKeyword) return false;

      // Keyword has high views but low engagement
      const hasHighViews = keyword.views > avgViews * 1.5;
      const hasLowEngagement = topPerformingKeyword.engagement < avgEngagement * 0.7;

      return hasHighViews && hasLowEngagement;
    });

    // Add underperforming keywords with detailed analysis
    underperformingKeywords.slice(0, 5).forEach(keyword => {
      const topPerformingKeyword = keywordPerformance.topPerforming.find(tp => tp.keyword === keyword.keyword);
      const performanceDiff = topPerformingKeyword ? (topPerformingKeyword.engagement - avgEngagement) : -avgEngagement;
      const performanceLevel = Math.abs(performanceDiff) > avgEngagement * 0.5 ? 'significantly' : 'moderately';

      reconsiderations.push({
        keyword: keyword.keyword,
        performance: performanceDiff,
        reason: `"${keyword.keyword}" gets ${keyword.views.toLocaleString()} views but ${performanceLevel} underperforms on engagement (${topPerformingKeyword?.engagement.toFixed(1)}% vs ${avgEngagement.toFixed(1)}% average) - consider improving content quality or targeting`,
      });
    });

    return reconsiderations;
  }

  /**
   * Check if word is a stop word
   */
  private isStopWord(word: string): boolean {
    const stopWords = [
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
      'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
      'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those',
      'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
      'my', 'your', 'his', 'her', 'its', 'our', 'their', 'mine', 'yours', 'hers', 'ours', 'theirs',
      'what', 'when', 'where', 'who', 'whom', 'which', 'why', 'how', 'all', 'any', 'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such',
      'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just', 'now', 'then', 'here', 'there',
      'up', 'down', 'out', 'off', 'over', 'under', 'again', 'further', 'then', 'once'
    ];
    return stopWords.includes(word.toLowerCase());
  }
}
