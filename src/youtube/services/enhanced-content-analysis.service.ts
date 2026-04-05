import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import { VideoAnalytics } from '../schemas/video-analytics.schema';
import { OpenAIService } from '../../openai/openai.service';
import { YouTubeService } from '../youtube.service';
import { OutlierDetectionService } from './outlier-detection.service';

export interface SentimentAnalysis {
  positive: number;
  neutral: number;
  negative: number;
  overall: 'positive' | 'neutral' | 'negative';
  confidence: number;
  emotions: {
    joy: number;
    anger: number;
    fear: number;
    sadness: number;
    surprise: number;
    disgust: number;
  };
  topics: string[];
}

export interface ContentTheme {
  theme: string;
  confidence: number;
  keywords: string[];
  examples: string[];
  aiInsights: string;
}

export interface ViralPrediction {
  score: number;
  confidence: 'low' | 'medium' | 'high';
  factors: string[];
  recommendations: string[];
  riskFactors: string[];
  aiExplanation: string;
  predictedViews: {
    min: number;
    max: number;
    confidence: number;
  };
}

export interface ContentQuality {
  score: number;
  factors: string[];
  improvements: string[];
  aiSuggestions: string;
  technicalScore: number;
  engagementScore: number;
  seoScore: number;
}

export interface AudienceInsights {
  targetAudience: string;
  engagementDrivers: string[];
  contentGaps: string[];
  aiRecommendations: string;
  demographics: {
    ageRange: string;
    gender: string;
    location: string;
    interests: string[];
  };
  behaviorPatterns: {
    watchTime: string;
    engagementPeak: string;
    contentPreferences: string[];
  };
}

export interface CompetitiveAnalysis {
  similarContent: Array<{
    videoId: string;
    title: string;
    views: number;
    engagementRate: number;
    similarity: number;
  }>;
  uniqueValue: string[];
  marketPosition: string;
  aiInsights: string;
  competitiveAdvantage: string[];
  threats: string[];
}

export interface ContentAnalysis {
  videoId: string;
  title: string;
  sentiment: SentimentAnalysis;
  themes: ContentTheme[];
  viralPotential: ViralPrediction;
  contentQuality: ContentQuality;
  audienceInsights: AudienceInsights;
  competitiveAnalysis: CompetitiveAnalysis;
  aiSummary: string;
  recommendations: string[];
  riskAssessment: string[];
}

@Injectable()
export class EnhancedContentAnalysisService {
  private readonly logger = new Logger(EnhancedContentAnalysisService.name);
  private readonly youtube = google.youtube('v3');

  constructor(
    @InjectModel('VideoAnalytics') private videoModel: Model<VideoAnalytics>,
    private readonly configService: ConfigService,
    private readonly openaiService: OpenAIService,
    private readonly youtubeService: YouTubeService,
    private readonly outlierDetectionService: OutlierDetectionService,
  ) {}

  /**
   * Comprehensive content analysis using real YouTube API data and AI
   */
  async analyzeContent(videoData: any, userId?: string): Promise<ContentAnalysis> {
    try {
      this.logger.log(`Starting comprehensive content analysis for video: ${videoData.videoId}`);

      // Get real YouTube API data if videoId is provided
      let enrichedVideoData = videoData;
      if (videoData.videoId && userId) {
        try {
          const youtubeData = await this.getYouTubeVideoData(videoData.videoId, userId);
          enrichedVideoData = { ...videoData, ...youtubeData };
        } catch (error) {
          this.logger.warn(`Failed to fetch YouTube API data: ${error.message}`);
        }
      }

      // Get similar videos for competitive analysis
      const similarVideos = await this.findSimilarVideos(enrichedVideoData);

      // Perform AI-powered analysis
      const [sentiment, themes, viralPotential, contentQuality, audienceInsights, competitiveAnalysis] = await Promise.all([
        this.performAISentimentAnalysis(enrichedVideoData),
        this.extractContentThemes(enrichedVideoData),
        this.predictViralPotential(enrichedVideoData, similarVideos),
        this.assessContentQuality(enrichedVideoData),
        this.analyzeAudienceInsights(enrichedVideoData),
        this.performCompetitiveAnalysis(enrichedVideoData, similarVideos),
      ]);

      // Generate AI summary and recommendations
      const [aiSummary, recommendations, riskAssessment] = await this.generateAIInsights(
        enrichedVideoData,
        sentiment,
        themes,
        viralPotential,
        contentQuality,
        audienceInsights,
        competitiveAnalysis
      );

      return {
        videoId: enrichedVideoData.videoId,
        title: enrichedVideoData.title,
        sentiment,
        themes,
        viralPotential,
        contentQuality,
        audienceInsights,
        competitiveAnalysis,
        aiSummary,
        recommendations,
        riskAssessment,
      };
    } catch (error) {
      this.logger.error('Error in comprehensive content analysis:', error);
      throw error;
    }
  }

  /**
   * Get real YouTube API data for a video
   */
  private async getYouTubeVideoData(videoId: string, userId: string): Promise<any> {
    try {
      // Get video details from YouTube API
      const videoDetails = await this.youtubeService.getVideoDetails(userId, videoId);

      // Get video statistics
      const videoStats = await this.getVideoStatistics(videoId, userId);

      // Get video comments for sentiment analysis
      const comments = await this.getVideoComments(videoId, userId);

      // Get video transcript if available
      const transcript = await this.getVideoTranscript(videoId, userId);

      return {
        ...videoDetails,
        statistics: videoStats,
        comments,
        transcript,
        apiData: true,
      };
    } catch (error) {
      this.logger.warn(`Failed to get YouTube API data: ${error.message}`);
      return {};
    }
  }

  /**
   * Get video statistics from YouTube API
   */
  private async getVideoStatistics(videoId: string, userId: string): Promise<any> {
    try {
      const response = await this.youtubeService.getVideoDetails(userId, videoId);
      return response?.items?.[0]?.statistics || {};
    } catch (error) {
      this.logger.warn(`Failed to get video statistics: ${error.message}`);
      return {};
    }
  }

  /**
   * Get video comments for sentiment analysis
   */
  private async getVideoComments(videoId: string, userId: string): Promise<any[]> {
    try {
      const auth = await this.getAuthenticatedYoutube(userId);
      const response = await auth.commentThreads.list({
        part: ['snippet'],
        videoId: videoId,
        maxResults: 100,
        order: 'relevance',
      });

      return response.data.items?.map(item => ({
        text: item.snippet.topLevelComment.snippet.textDisplay,
        author: item.snippet.topLevelComment.snippet.authorDisplayName,
        likeCount: item.snippet.topLevelComment.snippet.likeCount,
        publishedAt: item.snippet.topLevelComment.snippet.publishedAt,
      })) || [];
    } catch (error) {
      this.logger.warn(`Failed to get video comments: ${error.message}`);
      return [];
    }
  }

  /**
   * Get video transcript (if available)
   */
  private async getVideoTranscript(videoId: string, userId: string): Promise<string> {
    try {
      // This would require YouTube Data API v3 with captions
      // For now, return empty string
      return '';
    } catch (error) {
      this.logger.warn(`Failed to get video transcript: ${error.message}`);
      return '';
    }
  }

  /**
   * Find similar videos for competitive analysis
   */
  private async findSimilarVideos(videoData: any): Promise<any[]> {
    try {
      const searchQuery = this.generateSearchQuery(videoData);

      const auth = await this.getAuthenticatedYoutube();
      const response = await auth.search.list({
        part: ['snippet'],
        q: searchQuery,
        type: ['video'],
        maxResults: 10,
        order: 'relevance',
        publishedAfter: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // Last 30 days
      });

      return response.data.items || [];
    } catch (error) {
      this.logger.warn(`Failed to find similar videos: ${error.message}`);
      return [];
    }
  }

  /**
   * Generate search query for similar videos
   */
  private generateSearchQuery(videoData: any): string {
    const title = videoData.title || '';
    const description = videoData.description || '';
    const hashtags = videoData.hashtags || [];

    // Extract key terms from title and description
    const keyTerms = [...title.split(' '), ...description.split(' ')]
      .filter(word => word.length > 3)
      .slice(0, 5);

    return [...keyTerms, ...hashtags.slice(0, 3)].join(' ');
  }

  /**
   * Perform AI-powered sentiment analysis using OpenAI
   */
  private async performAISentimentAnalysis(videoData: any): Promise<SentimentAnalysis> {
    try {
      const text = `${videoData.title} ${videoData.description} ${videoData.transcript || ''}`;
      const comments = videoData.comments?.map((c: any) => c.text).join(' ') || '';

      const prompt = `
        Analyze the sentiment of this YouTube video content and comments:

        Title: ${videoData.title}
        Description: ${videoData.description}
        Transcript: ${videoData.transcript || 'Not available'}
        Comments: ${comments}

        Provide a detailed sentiment analysis including:
        1. Overall sentiment (positive/neutral/negative) with confidence score
        2. Emotional breakdown (joy, anger, fear, sadness, surprise, disgust)
        3. Key topics discussed
        4. Sentiment distribution (positive %, neutral %, negative %)

        Return as JSON with this structure:
        {
          "positive": 75,
          "neutral": 20,
          "negative": 5,
          "overall": "positive",
          "confidence": 0.85,
          "emotions": {
            "joy": 0.6,
            "anger": 0.1,
            "fear": 0.05,
            "sadness": 0.1,
            "surprise": 0.1,
            "disgust": 0.05
          },
          "topics": ["cooking", "tutorial", "education"]
        }
      `;

      const response = await this.openaiService.generatePostIdea({ prompt });

      try {
        return JSON.parse(response);
      } catch (parseError) {
        this.logger.warn('Failed to parse AI sentiment response, using fallback');
        return this.fallbackSentimentAnalysis(videoData);
      }
    } catch (error) {
      this.logger.warn(`AI sentiment analysis failed: ${error.message}`);
      return this.fallbackSentimentAnalysis(videoData);
    }
  }

  /**
   * Extract content themes using AI
   */
  private async extractContentThemes(videoData: any): Promise<ContentTheme[]> {
    try {
      const text = `${videoData.title} ${videoData.description} ${videoData.transcript || ''}`;

      const prompt = `
        Analyze this YouTube video content and identify the main themes:

        Content: ${text}

        Identify 3-5 main themes with:
        1. Theme name
        2. Confidence score (0-1)
        3. Key keywords
        4. Example phrases
        5. AI insights about the theme

        Return as JSON array:
        [
          {
            "theme": "Educational",
            "confidence": 0.9,
            "keywords": ["how to", "tutorial", "guide"],
            "examples": ["Learn how to make perfect pasta", "Step-by-step cooking guide"],
            "aiInsights": "This content follows educational best practices with clear structure and actionable steps"
          }
        ]
      `;

      const response = await this.openaiService.generatePostIdea({ prompt });

      try {
        return JSON.parse(response);
      } catch (parseError) {
        this.logger.warn('Failed to parse AI themes response, using fallback');
        return this.fallbackContentThemes(videoData);
      }
    } catch (error) {
      this.logger.warn(`AI theme extraction failed: ${error.message}`);
      return this.fallbackContentThemes(videoData);
    }
  }

  /**
   * Predict viral potential using AI and data analysis
   */
  private async predictViralPotential(videoData: any, similarVideos: any[]): Promise<ViralPrediction> {
    try {
      const engagementRate = this.calculateEngagementRate(videoData);
      const viewVelocity = this.calculateViewVelocity(videoData);
      const similarPerformance = this.analyzeSimilarVideos(similarVideos);

      const prompt = `
        Predict the viral potential of this YouTube video:

        Video Data:
        - Title: ${videoData.title}
        - Views: ${videoData.viewCount || 0}
        - Likes: ${videoData.likeCount || 0}
        - Comments: ${videoData.commentCount || 0}
        - Duration: ${videoData.duration || 0} seconds
        - Engagement Rate: ${engagementRate}%
        - View Velocity: ${viewVelocity} views/hour

        Similar Videos Performance:
        ${similarPerformance}

        Provide viral potential analysis with:
        1. Viral score (0-100)
        2. Confidence level (low/medium/high)
        3. Key factors contributing to virality
        4. Recommendations to increase viral potential
        5. Risk factors
        6. AI explanation
        7. Predicted view range

        Return as JSON:
        {
          "score": 78,
          "confidence": "high",
          "factors": ["Educational content", "High engagement", "Trending topic"],
          "recommendations": ["Add emotional hooks", "Optimize thumbnail"],
          "riskFactors": ["Competitive niche"],
          "aiExplanation": "This content has strong viral potential due to...",
          "predictedViews": {
            "min": 50000,
            "max": 200000,
            "confidence": 0.75
          }
        }
      `;

      const response = await this.openaiService.generatePostIdea({ prompt });

      try {
        return JSON.parse(response);
      } catch (parseError) {
        this.logger.warn('Failed to parse AI viral prediction, using fallback');
        return this.fallbackViralPrediction(videoData, engagementRate);
      }
    } catch (error) {
      this.logger.warn(`AI viral prediction failed: ${error.message}`);
      return this.fallbackViralPrediction(videoData, this.calculateEngagementRate(videoData));
    }
  }

  /**
   * Assess content quality using multiple metrics
   */
  private async assessContentQuality(videoData: any): Promise<ContentQuality> {
    try {
      const technicalScore = this.calculateTechnicalScore(videoData);
      const engagementScore = this.calculateEngagementScore(videoData);
      const seoScore = this.calculateSEOScore(videoData);
      const overallScore = (technicalScore + engagementScore + seoScore) / 3;

      const prompt = `
        Assess the content quality of this YouTube video:

        Technical Metrics:
        - Duration: ${videoData.duration || 0} seconds
        - Title length: ${videoData.title?.length || 0} characters
        - Description length: ${videoData.description?.length || 0} characters
        - Hashtags: ${videoData.hashtags?.length || 0}

        Engagement Metrics:
        - Views: ${videoData.viewCount || 0}
        - Engagement rate: ${this.calculateEngagementRate(videoData)}%
        - Like ratio: ${this.calculateLikeRatio(videoData)}%

        SEO Metrics:
        - Title optimization: ${this.assessTitleOptimization(videoData)}
        - Description optimization: ${this.assessDescriptionOptimization(videoData)}
        - Hashtag optimization: ${this.assessHashtagOptimization(videoData)}

        Provide quality assessment with:
        1. Overall quality score (0-100)
        2. Technical score (0-100)
        3. Engagement score (0-100)
        4. SEO score (0-100)
        5. Quality factors
        6. Improvement suggestions
        7. AI recommendations

        Return as JSON:
        {
          "score": 85,
          "factors": ["Good title length", "High engagement"],
          "improvements": ["Add more hashtags", "Optimize description"],
          "aiSuggestions": "Consider adding timestamps to improve user experience",
          "technicalScore": 80,
          "engagementScore": 90,
          "seoScore": 85
        }
      `;

      const response = await this.openaiService.generatePostIdea({ prompt });

      try {
        return JSON.parse(response);
      } catch (parseError) {
        this.logger.warn('Failed to parse AI quality assessment, using fallback');
        return this.fallbackContentQuality(videoData, technicalScore, engagementScore, seoScore, overallScore);
      }
    } catch (error) {
      this.logger.warn(`AI quality assessment failed: ${error.message}`);
      const technicalScore = this.calculateTechnicalScore(videoData);
      const engagementScore = this.calculateEngagementScore(videoData);
      const seoScore = this.calculateSEOScore(videoData);
      const overallScore = (technicalScore + engagementScore + seoScore) / 3;
      return this.fallbackContentQuality(videoData, technicalScore, engagementScore, seoScore, overallScore);
    }
  }

  /**
   * Analyze audience insights using AI
   */
  private async analyzeAudienceInsights(videoData: any): Promise<AudienceInsights> {
    try {
      const prompt = `
        Analyze the target audience and engagement patterns for this YouTube video:

        Content: ${videoData.title} - ${videoData.description}
        Engagement: ${this.calculateEngagementRate(videoData)}%
        Comments: ${videoData.comments?.length || 0}

        Provide audience analysis including:
        1. Target audience demographics
        2. Engagement drivers
        3. Content gaps
        4. Behavior patterns
        5. AI recommendations

        Return as JSON:
        {
          "targetAudience": "Fitness enthusiasts aged 18-35",
          "engagementDrivers": ["Educational value", "Practical tips"],
          "contentGaps": ["Missing call to action"],
          "aiRecommendations": "Consider adding beginner modifications",
          "demographics": {
            "ageRange": "18-35",
            "gender": "Mixed",
            "location": "Global",
            "interests": ["Fitness", "Health", "Exercise"]
          },
          "behaviorPatterns": {
            "watchTime": "High retention",
            "engagementPeak": "Weekends",
            "contentPreferences": ["Tutorials", "Quick tips"]
          }
        }
      `;

      const response = await this.openaiService.generatePostIdea({ prompt });

      try {
        return JSON.parse(response);
      } catch (parseError) {
        this.logger.warn('Failed to parse AI audience insights, using fallback');
        return this.fallbackAudienceInsights(videoData);
      }
    } catch (error) {
      this.logger.warn(`AI audience analysis failed: ${error.message}`);
      return this.fallbackAudienceInsights(videoData);
    }
  }

  /**
   * Perform competitive analysis using AI
   */
  private async performCompetitiveAnalysis(videoData: any, similarVideos: any[]): Promise<CompetitiveAnalysis> {
    try {
      const prompt = `
        Perform competitive analysis for this YouTube video:

        Video: ${videoData.title}
        Views: ${videoData.viewCount || 0}
        Engagement: ${this.calculateEngagementRate(videoData)}%

        Similar Videos:
        ${similarVideos.map(v => `- ${v.snippet?.title}: ${v.statistics?.viewCount || 0} views`).join('\n')}

        Provide competitive analysis including:
        1. Market position
        2. Unique value propositions
        3. Competitive advantages
        4. Threats
        5. AI insights

        Return as JSON:
        {
          "similarContent": [
            {
              "videoId": "abc123",
              "title": "Similar Video",
              "views": 50000,
              "engagementRate": 5.2,
              "similarity": 0.8
            }
          ],
          "uniqueValue": ["Unique perspective", "Better production quality"],
          "marketPosition": "Innovator",
          "aiInsights": "This content differentiates through...",
          "competitiveAdvantage": ["Higher engagement", "Better SEO"],
          "threats": ["Saturated market", "Competition from established creators"]
        }
      `;

      const response = await this.openaiService.generatePostIdea({ prompt });

      try {
        return JSON.parse(response);
      } catch (parseError) {
        this.logger.warn('Failed to parse AI competitive analysis, using fallback');
        return this.fallbackCompetitiveAnalysis(videoData, similarVideos);
      }
    } catch (error) {
      this.logger.warn(`AI competitive analysis failed: ${error.message}`);
      return this.fallbackCompetitiveAnalysis(videoData, similarVideos);
    }
  }

  /**
   * Generate AI insights and recommendations
   */
  private async generateAIInsights(
    videoData: any,
    sentiment: SentimentAnalysis,
    themes: ContentTheme[],
    viralPotential: ViralPrediction,
    contentQuality: ContentQuality,
    audienceInsights: AudienceInsights,
    competitiveAnalysis: CompetitiveAnalysis
  ): Promise<[string, string[], string[]]> {
    try {
      const prompt = `
        Generate comprehensive insights and recommendations for this YouTube video:

        Video: ${videoData.title}
        Sentiment: ${sentiment.overall} (${sentiment.confidence} confidence)
        Themes: ${themes.map(t => t.theme).join(', ')}
        Viral Potential: ${viralPotential.score}/100 (${viralPotential.confidence} confidence)
        Quality Score: ${contentQuality.score}/100
        Target Audience: ${audienceInsights.targetAudience}
        Market Position: ${competitiveAnalysis.marketPosition}

        Provide:
        1. Executive summary (2-3 sentences)
        2. Top 5 actionable recommendations
        3. Top 3 risk factors to address

        Return as JSON:
        {
          "summary": "This content shows strong potential with positive sentiment and high engagement...",
          "recommendations": [
            "Optimize thumbnail for better CTR",
            "Add timestamps to improve user experience",
            "Include more call-to-actions",
            "Collaborate with similar creators",
            "Experiment with posting times"
          ],
          "risks": [
            "Competition from established creators",
            "Algorithm changes affecting reach",
            "Content saturation in niche"
          ]
        }
      `;

      const response = await this.openaiService.generatePostIdea({ prompt });

      try {
        const parsed = JSON.parse(response);
        return [parsed.summary, parsed.recommendations, parsed.risks];
      } catch (parseError) {
        this.logger.warn('Failed to parse AI insights, using fallback');
        return this.fallbackAIInsights(videoData);
      }
    } catch (error) {
      this.logger.warn(`AI insights generation failed: ${error.message}`);
      return this.fallbackAIInsights(videoData);
    }
  }

  // Helper methods for calculations
  private calculateEngagementRate(videoData: any): number {
    const views = videoData.viewCount || 1;
    const likes = videoData.likeCount || 0;
    const comments = videoData.commentCount || 0;
    return ((likes + comments) / views) * 100;
  }

  private calculateViewVelocity(videoData: any): number {
    // Calculate views per hour since published
    const publishedAt = new Date(videoData.publishedAt);
    const now = new Date();
    const hoursSincePublished = (now.getTime() - publishedAt.getTime()) / (1000 * 60 * 60);
    return (videoData.viewCount || 0) / Math.max(hoursSincePublished, 1);
  }

  private calculateLikeRatio(videoData: any): number {
    const views = videoData.viewCount || 1;
    const likes = videoData.likeCount || 0;
    return (likes / views) * 100;
  }

  private calculateTechnicalScore(videoData: any): number {
    let score = 0;

    // Duration score (optimal: 3-10 minutes)
    const duration = videoData.duration || 0;
    if (duration >= 180 && duration <= 600) score += 25;
    else if (duration >= 60 && duration <= 1200) score += 15;

    // Title score (optimal: 50-60 characters)
    const titleLength = videoData.title?.length || 0;
    if (titleLength >= 50 && titleLength <= 60) score += 25;
    else if (titleLength >= 30 && titleLength <= 80) score += 15;

    // Description score (optimal: 250+ characters)
    const descLength = videoData.description?.length || 0;
    if (descLength >= 250) score += 25;
    else if (descLength >= 100) score += 15;

    // Hashtags score (optimal: 3-5 hashtags)
    const hashtagCount = videoData.hashtags?.length || 0;
    if (hashtagCount >= 3 && hashtagCount <= 5) score += 25;
    else if (hashtagCount >= 1 && hashtagCount <= 8) score += 15;

    return score;
  }

  private calculateEngagementScore(videoData: any): number {
    const engagementRate = this.calculateEngagementRate(videoData);

    if (engagementRate >= 5) return 100;
    if (engagementRate >= 3) return 80;
    if (engagementRate >= 1) return 60;
    if (engagementRate >= 0.5) return 40;
    return 20;
  }

  private calculateSEOScore(videoData: any): number {
    let score = 0;

    // Title optimization
    if (this.assessTitleOptimization(videoData)) score += 25;

    // Description optimization
    if (this.assessDescriptionOptimization(videoData)) score += 25;

    // Hashtag optimization
    if (this.assessHashtagOptimization(videoData)) score += 25;

    // Call-to-action presence
    if (this.hasCallToAction(videoData)) score += 25;

    return score;
  }

  private assessTitleOptimization(videoData: any): boolean {
    const title = videoData.title?.toLowerCase() || '';
    const hasKeywords = title.includes('how to') || title.includes('tutorial') || title.includes('guide');
    const hasNumbers = /\d+/.test(title);
    const hasEmotionalWords = title.includes('amazing') || title.includes('incredible') || title.includes('best');
    return hasKeywords || hasNumbers || hasEmotionalWords;
  }

  private assessDescriptionOptimization(videoData: any): boolean {
    const description = videoData.description || '';
    return description.length >= 250 && description.includes('#');
  }

  private assessHashtagOptimization(videoData: any): boolean {
    const hashtags = videoData.hashtags || [];
    return hashtags.length >= 3 && hashtags.length <= 8;
  }

  private hasCallToAction(videoData: any): boolean {
    const text = `${videoData.title} ${videoData.description}`.toLowerCase();
    return text.includes('subscribe') || text.includes('like') || text.includes('comment') || text.includes('share');
  }

  private analyzeSimilarVideos(similarVideos: any[]): string {
    if (similarVideos.length === 0) return 'No similar videos found';

    const avgViews = similarVideos.reduce((sum, v) => sum + (parseInt(v.statistics?.viewCount) || 0), 0) / similarVideos.length;
    const avgEngagement = similarVideos.reduce((sum, v) => {
      const views = parseInt(v.statistics?.viewCount) || 1;
      const likes = parseInt(v.statistics?.likeCount) || 0;
      return sum + (likes / views) * 100;
    }, 0) / similarVideos.length;

    return `Average views: ${Math.round(avgViews)}, Average engagement: ${avgEngagement.toFixed(2)}%`;
  }

  private async getAuthenticatedYoutube(userId?: string) {
    try {
      if (userId) {
        const accessToken = await this.youtubeService.getValidAccessToken(userId);
        const auth = new google.auth.OAuth2();
        auth.setCredentials({ access_token: accessToken });
        return google.youtube({ version: 'v3', auth });
      } else {
        // Use API key for public data
        const apiKey = this.configService.get<string>('YOUTUBE_API_KEY');
        return google.youtube({ version: 'v3', auth: apiKey });
      }
    } catch (error) {
      this.logger.error('Failed to get authenticated YouTube:', error);
      throw error;
    }
  }

  // Fallback methods for when AI fails
  private fallbackSentimentAnalysis(videoData: any): SentimentAnalysis {
    const text = `${videoData.title} ${videoData.description}`.toLowerCase();
    const positiveWords = ['amazing', 'awesome', 'best', 'great', 'love', 'perfect', 'wonderful'];
    const negativeWords = ['terrible', 'awful', 'worst', 'hate', 'bad', 'horrible'];

    const positiveCount = positiveWords.filter(word => text.includes(word)).length;
    const negativeCount = negativeWords.filter(word => text.includes(word)).length;

    const total = positiveCount + negativeCount;
    const positive = total > 0 ? (positiveCount / total) * 100 : 50;
    const negative = total > 0 ? (negativeCount / total) * 100 : 0;
    const neutral = 100 - positive - negative;

    return {
      positive,
      neutral,
      negative,
      overall: positive > negative ? 'positive' : negative > positive ? 'negative' : 'neutral',
      confidence: Math.abs(positive - negative) / 100,
      emotions: { joy: 0.5, anger: 0.1, fear: 0.1, sadness: 0.1, surprise: 0.1, disgust: 0.1 },
      topics: ['content', 'video'],
    };
  }

  private fallbackContentThemes(videoData: any): ContentTheme[] {
    const text = `${videoData.title} ${videoData.description}`.toLowerCase();
    const themes: ContentTheme[] = [];

    if (text.includes('how to') || text.includes('tutorial')) {
      themes.push({
        theme: 'Educational',
        confidence: 0.8,
        keywords: ['how to', 'tutorial', 'guide'],
        examples: [videoData.title],
        aiInsights: 'Educational content with clear learning objectives',
      });
    }

    if (text.includes('review') || text.includes('honest')) {
      themes.push({
        theme: 'Review',
        confidence: 0.7,
        keywords: ['review', 'honest', 'opinion'],
        examples: [videoData.title],
        aiInsights: 'Review content providing personal opinions and experiences',
      });
    }

    return themes;
  }

  private fallbackViralPrediction(videoData: any, engagementRate: number): ViralPrediction {
    const score = Math.min(100, engagementRate * 10);
    const confidence = score > 70 ? 'high' : score > 40 ? 'medium' : 'low';

    return {
      score,
      confidence,
      factors: ['Engagement rate', 'Content quality'],
      recommendations: ['Optimize thumbnail', 'Add call-to-action'],
      riskFactors: ['Competitive niche'],
      aiExplanation: 'Prediction based on engagement metrics and content analysis',
      predictedViews: {
        min: videoData.viewCount || 0,
        max: (videoData.viewCount || 0) * 2,
        confidence: 0.6,
      },
    };
  }

  private fallbackContentQuality(videoData: any, technicalScore: number, engagementScore: number, seoScore: number, overallScore: number): ContentQuality {
    return {
      score: overallScore,
      factors: ['Technical optimization', 'Engagement metrics'],
      improvements: ['Add more hashtags', 'Optimize description'],
      aiSuggestions: 'Focus on improving technical aspects and engagement',
      technicalScore,
      engagementScore,
      seoScore,
    };
  }

  private fallbackAudienceInsights(videoData: any): AudienceInsights {
    return {
      targetAudience: 'General audience',
      engagementDrivers: ['Content quality', 'Relevance'],
      contentGaps: ['Missing call to action'],
      aiRecommendations: 'Add more interactive elements',
      demographics: {
        ageRange: '18-34',
        gender: 'Mixed',
        location: 'Global',
        interests: ['Entertainment', 'Education'],
      },
      behaviorPatterns: {
        watchTime: 'Variable',
        engagementPeak: 'Weekends',
        contentPreferences: ['Short-form content'],
      },
    };
  }

  private fallbackCompetitiveAnalysis(videoData: any, similarVideos: any[]): CompetitiveAnalysis {
    return {
      similarContent: similarVideos.map(v => ({
        videoId: v.id?.videoId || '',
        title: v.snippet?.title || '',
        views: parseInt(v.statistics?.viewCount) || 0,
        engagementRate: 0,
        similarity: 0.5,
      })),
      uniqueValue: ['Original content'],
      marketPosition: 'Follower',
      aiInsights: 'Standard content in competitive market',
      competitiveAdvantage: ['Unique perspective'],
      threats: ['Market saturation'],
    };
  }

  private fallbackAIInsights(videoData: any): [string, string[], string[]] {
    return [
      'Content analysis completed with standard metrics and recommendations.',
      [
        'Optimize video title for better SEO',
        'Add more engaging thumbnails',
        'Include call-to-actions in description',
        'Experiment with posting times',
        'Engage with audience comments',
      ],
      [
        'Competition from established creators',
        'Algorithm changes',
        'Content saturation',
      ],
    ];
  }
}
