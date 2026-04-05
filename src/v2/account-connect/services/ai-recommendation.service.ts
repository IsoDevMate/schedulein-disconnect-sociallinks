import { Injectable, Logger } from '@nestjs/common';
import { OpenAIService } from '../../../openai/openai.service';
import { AdvancedAIAnalysisService } from './advanced-ai-analysis.service';

export interface VideoData {
  id: string;
  title: string;
  description?: string;
  publishedAt: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  engagementRate: number;
  thumbnailUrl?: string;
}

export interface AIRecommendations {
  bestPostingTimes: Array<{
    time: string;
    reason: string;
    confidence: number;
  }>;
  suggestedHashtags: Array<{
    hashtag: string;
    confidence: number;
    reason: string;
  }>;
  contentIdeas: Array<{
    idea: string;
    confidence: number;
    reasoning: string;
  }>;
  contentAnalysis: {
    themes: string[];
    audienceInsights: string[];
    performanceInsights: string[];
  };
}

@Injectable()
export class AIRecommendationService {
  private readonly logger = new Logger(AIRecommendationService.name);

  constructor(
    private readonly openAIService: OpenAIService,
    private readonly advancedAIAnalysisService: AdvancedAIAnalysisService
  ) {}

  async generateRecommendations(
    videos: VideoData[],
    platform: 'youtube' | 'tiktok'
  ): Promise<AIRecommendations> {
    try {
      this.logger.debug(`Generating AI recommendations for ${videos.length} ${platform} videos`);

      // Use advanced AI analysis for better recommendations
      const advancedAnalysis = await this.advancedAIAnalysisService.analyzeContentPerformance(videos, platform);

      // Convert advanced analysis to our recommendation format
      const recommendations = this.convertAdvancedAnalysisToRecommendations(advancedAnalysis, platform);

      return recommendations;
    } catch (error) {
      this.logger.error(`Failed to generate AI recommendations: ${error.message}`, error.stack);
      // Return fallback recommendations if AI fails
      return this.getFallbackRecommendations(videos, platform);
    }
  }

  private prepareAnalysisData(videos: VideoData[], platform: string): string {
    const recentVideos = videos.slice(0, 10); // Analyze most recent 10 videos

    const videoSummaries = recentVideos.map(video => ({
      title: video.title,
      description: video.description || '',
      publishedAt: video.publishedAt,
      viewCount: video.viewCount,
      likeCount: video.likeCount,
      commentCount: video.commentCount,
      engagementRate: video.engagementRate
    }));

    // Calculate performance metrics
    const totalViews = videos.reduce((sum, v) => sum + v.viewCount, 0);
    const totalLikes = videos.reduce((sum, v) => sum + v.likeCount, 0);
    const totalComments = videos.reduce((sum, v) => sum + v.commentCount, 0);
    const avgEngagementRate = videos.reduce((sum, v) => sum + v.engagementRate, 0) / videos.length;

    // Analyze posting patterns
    const postingTimes = this.analyzePostingTimes(videos);
    const topPerformingVideos = videos
      .sort((a, b) => b.engagementRate - a.engagementRate)
      .slice(0, 3);

    return JSON.stringify({
      platform,
      videoCount: videos.length,
      recentVideos: videoSummaries,
      performanceMetrics: {
        totalViews,
        totalLikes,
        totalComments,
        avgEngagementRate: Math.round(avgEngagementRate * 100) / 100
      },
      postingPatterns: postingTimes,
      topPerformingVideos: topPerformingVideos.map(v => ({
        title: v.title,
        engagementRate: v.engagementRate,
        viewCount: v.viewCount
      }))
    });
  }

  private async generateAIRecommendations(analysisData: string, platform: string): Promise<AIRecommendations> {
    const systemPrompt = `You are an expert social media strategist and content creator with deep knowledge of ${platform} algorithms and audience behavior. Analyze the provided content data and generate intelligent, data-driven recommendations.`;

    const userPrompt = `Based on the following ${platform} content analysis data, provide specific recommendations:

${analysisData}

Please provide recommendations in the following JSON format:
{
  "bestPostingTimes": [
    {
      "time": "Day HH:MM-HH:MM",
      "reason": "Specific reason based on data analysis",
      "confidence": 0.0-1.0
    }
  ],
  "suggestedHashtags": [
    {
      "hashtag": "#hashtag",
      "confidence": 0.0-1.0,
      "reason": "Why this hashtag is recommended"
    }
  ],
  "contentIdeas": [
    {
      "idea": "Specific content idea",
      "confidence": 0.0-1.0,
      "reasoning": "Why this idea would work well"
    }
  ],
  "contentAnalysis": {
    "themes": ["theme1", "theme2"],
    "audienceInsights": ["insight1", "insight2"],
    "performanceInsights": ["insight1", "insight2"]
  }
}

Guidelines:
- Base recommendations on actual performance data
- Consider ${platform}-specific best practices
- Provide specific, actionable recommendations
- Include confidence scores based on data strength
- Focus on content themes that are performing well
- Suggest hashtags that align with successful content
- Recommend posting times based on engagement patterns`;

    try {
      const response = await this.openAIService.generatePostIdea({
        prompt: userPrompt
      });

      // Parse the AI response
      const aiResponse = this.parseAIResponse(response);
      return aiResponse;
    } catch (error) {
      this.logger.error(`AI recommendation generation failed: ${error.message}`);
      throw error;
    }
  }

  private parseAIResponse(response: string): AIRecommendations {
    try {
      // Try to extract JSON from the response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          bestPostingTimes: parsed.bestPostingTimes || [],
          suggestedHashtags: parsed.suggestedHashtags || [],
          contentIdeas: parsed.contentIdeas || [],
          contentAnalysis: parsed.contentAnalysis || {
            themes: [],
            audienceInsights: [],
            performanceInsights: []
          }
        };
      }
    } catch (error) {
      this.logger.warn(`Failed to parse AI response as JSON: ${error.message}`);
    }

    // Fallback: parse text response
    return this.parseTextResponse(response);
  }

  private parseTextResponse(response: string): AIRecommendations {
    // Basic text parsing fallback
    return {
      bestPostingTimes: [
        {
          time: "Monday 17:00-18:00",
          reason: "Based on AI analysis of your content performance",
          confidence: 0.7
        }
      ],
      suggestedHashtags: [
        {
          hashtag: "#viral",
          confidence: 0.6,
          reason: "AI-suggested trending hashtag"
        }
      ],
      contentIdeas: [
        {
          idea: "Create content based on your top-performing themes",
          confidence: 0.8,
          reasoning: "AI analysis of your successful content patterns"
        }
      ],
      contentAnalysis: {
        themes: ["content themes"],
        audienceInsights: ["audience insights"],
        performanceInsights: ["performance insights"]
      }
    };
  }

  private analyzePostingTimes(videos: VideoData[]): Array<{day: string, hour: number, count: number}> {
    const postingTimes: { [key: string]: number } = {};

    videos.forEach(video => {
      const date = new Date(video.publishedAt);
      const day = date.toLocaleDateString('en-US', { weekday: 'long' });
      const hour = date.getHours();
      const key = `${day}-${hour}`;
      postingTimes[key] = (postingTimes[key] || 0) + 1;
    });

    return Object.entries(postingTimes)
      .map(([key, count]) => {
        const [day, hour] = key.split('-');
        return { day, hour: parseInt(hour), count };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }

  /**
   * Convert advanced AI analysis to recommendation format
   */
  private convertAdvancedAnalysisToRecommendations(advancedAnalysis: any, platform: string): AIRecommendations {
    return {
      bestPostingTimes: advancedAnalysis.audienceInsights?.optimalPostingTimes?.map((time: any) => ({
        time: time.time,
        reason: time.reason,
        confidence: time.confidence || 0.8
      })) || [],

      suggestedHashtags: [
        ...(advancedAnalysis.contentStrategy?.hashtagStrategy?.primaryHashtags?.map((tag: string) => ({
          hashtag: tag,
          confidence: 0.9,
          reason: advancedAnalysis.contentStrategy.hashtagStrategy.reasoning || 'Primary hashtag strategy'
        })) || []),
        ...(advancedAnalysis.contentStrategy?.hashtagStrategy?.trendingHashtags?.map((tag: string) => ({
          hashtag: tag,
          confidence: 0.7,
          reason: 'Currently trending hashtag'
        })) || [])
      ],

      contentIdeas: [
        ...(advancedAnalysis.contentStrategy?.recommendedThemes?.map((theme: any) => ({
          idea: theme.contentIdeas?.[0] || `Create content around ${theme.theme}`,
          confidence: theme.priority === 'high' ? 0.9 : theme.priority === 'medium' ? 0.7 : 0.5,
          reasoning: theme.reasoning
        })) || []),
        ...(advancedAnalysis.viralPrediction?.nextViralContent ? [{
          idea: advancedAnalysis.viralPrediction.nextViralContent.contentType,
          confidence: advancedAnalysis.viralPrediction.nextViralContent.viralProbability,
          reasoning: advancedAnalysis.viralPrediction.nextViralContent.reasoning
        }] : [])
      ],

      contentAnalysis: {
        themes: advancedAnalysis.viralPatterns?.highPerformingThemes?.map((theme: any) => theme.theme) || [],
        audienceInsights: advancedAnalysis.audienceInsights?.engagementPatterns || [],
        performanceInsights: advancedAnalysis.viralPatterns?.engagementDrivers?.map((driver: any) => driver.description) || []
      }
    };
  }

  private getFallbackRecommendations(videos: VideoData[], platform: string): AIRecommendations {
    this.logger.warn(`Using fallback recommendations for ${platform}`);

    return {
      bestPostingTimes: [
        {
          time: "Monday 17:00-18:00",
          reason: "High posting frequency at this time",
          confidence: 0.6
        }
      ],
      suggestedHashtags: [
        {
          hashtag: "#viral",
          confidence: 0.5,
          reason: "Currently trending"
        },
        {
          hashtag: "#fyp",
          confidence: 0.5,
          reason: "Platform-specific trending"
        }
      ],
      contentIdeas: [
        {
          idea: "Create a compilation of your best moments",
          confidence: 0.7,
          reasoning: "Based on your content performance"
        },
        {
          idea: "Share behind-the-scenes content",
          confidence: 0.6,
          reasoning: "Engaging content format"
        }
      ],
      contentAnalysis: {
        themes: ["content creation"],
        audienceInsights: ["audience engagement patterns"],
        performanceInsights: ["content performance trends"]
      }
    };
  }


}
