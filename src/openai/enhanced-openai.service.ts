import { Injectable, Logger } from "@nestjs/common";
import OpenAI from "openai";
import { ConfigService } from "@nestjs/config";

export interface ContentAnalysisData {
  videos: Array<{
    title: string;
    description?: string;
    viewCount: number;
    likeCount: number;
    commentCount: number;
    engagementRate: number;
    publishedAt: string;
  }>;
  platform: 'youtube' | 'tiktok' | 'instagram';
  totalVideos: number;
  avgEngagementRate: number;
  topPerformingVideos: Array<{
    title: string;
    engagementRate: number;
    viewCount: number;
  }>;
}

export interface ViralPredictionData {
  content: {
    title: string;
    description: string;
    hashtags: string[];
    duration?: number;
  };
  creator: {
    avgEngagementRate: number;
    followerCount?: number;
    postingFrequency: number;
    topPerformingThemes: string[];
  };
  platform: 'youtube' | 'tiktok' | 'instagram';
  timing: {
    dayOfWeek: string;
    hour: number;
  };
}

export interface TrendAnalysisData {
  platform: 'youtube' | 'tiktok' | 'instagram';
  niche?: string;
  recentPerformance: Array<{
    theme: string;
    avgEngagement: number;
    frequency: number;
  }>;
  competitorAnalysis?: Array<{
    theme: string;
    avgEngagement: number;
    trendDirection: 'rising' | 'stable' | 'declining';
  }>;
}

@Injectable()
export class EnhancedOpenAIService {
  private readonly logger = new Logger(EnhancedOpenAIService.name);
  private openai: OpenAI;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>("OPENAI_API_KEY");

    if (!apiKey) {
      this.logger.error("OPENAI_API_KEY is not set in environment variables");
      throw new Error("OPENAI_API_KEY is not configured");
    }

    this.openai = new OpenAI({
      apiKey,
      maxRetries: 5,
      timeout: 120000, // Increased timeout for complex analysis
    });

    this.logger.debug("Enhanced OpenAI service initialized successfully");
  }

  /**
   * Advanced content analysis similar to Virlo AI
   */
  async analyzeContentPerformance(data: ContentAnalysisData): Promise<any> {
    try {
      this.logger.debug(`Analyzing content performance for ${data.platform} with ${data.videos.length} videos`);

      const systemPrompt = `You are Virlo AI, an advanced social media analytics AI that specializes in identifying viral content patterns and providing actionable insights for content creators. You have deep knowledge of ${data.platform} algorithms, audience behavior, and viral content mechanics.

Your expertise includes:
- Identifying content patterns that lead to viral success
- Understanding platform-specific algorithm preferences
- Analyzing engagement patterns and audience behavior
- Predicting content performance based on historical data
- Providing specific, actionable recommendations

Always provide data-driven insights with specific reasoning and actionable recommendations.`;

      const userPrompt = `Analyze this ${data.platform} content performance data and provide comprehensive insights:

CONTENT DATA:
${JSON.stringify(data, null, 2)}

Please provide a detailed analysis in the following JSON format:
{
  "viralPatterns": {
    "highPerformingThemes": [
      {
        "theme": "theme name",
        "avgEngagementRate": 0.0,
        "frequency": 0,
        "viralPotential": "high|medium|low",
        "reasoning": "Why this theme performs well"
      }
    ],
    "engagementDrivers": [
      {
        "factor": "factor name",
        "impact": "high|medium|low",
        "description": "How this factor drives engagement"
      }
    ],
    "optimalContentLength": {
      "recommendedDuration": "duration range",
      "reasoning": "Why this duration works best"
    }
  },
  "audienceInsights": {
    "preferredContentTypes": ["type1", "type2"],
    "engagementPatterns": ["pattern1", "pattern2"],
    "optimalPostingTimes": [
      {
        "time": "Day HH:MM-HH:MM",
        "reason": "Why this time works",
        "confidence": 0.0-1.0
      }
    ]
  },
  "contentStrategy": {
    "recommendedThemes": [
      {
        "theme": "theme name",
        "priority": "high|medium|low",
        "reasoning": "Why to focus on this theme",
        "contentIdeas": ["idea1", "idea2"]
      }
    ],
    "hashtagStrategy": {
      "primaryHashtags": ["#tag1", "#tag2"],
      "nicheHashtags": ["#tag3", "#tag4"],
      "trendingHashtags": ["#tag5", "#tag6"],
      "reasoning": "Why these hashtags will work"
    },
    "optimizationTips": [
      {
        "tip": "Specific optimization tip",
        "impact": "Expected improvement",
        "implementation": "How to implement"
      }
    ]
  },
  "viralPrediction": {
    "nextViralContent": {
      "contentType": "Recommended content type",
      "keyElements": ["element1", "element2"],
      "viralProbability": 0.0-1.0,
      "reasoning": "Why this could go viral"
    },
    "growthStrategy": {
      "immediateActions": ["action1", "action2"],
      "longTermStrategy": ["strategy1", "strategy2"],
      "expectedOutcome": "Expected growth trajectory"
    }
  }
}`;

      const response = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.3, // Lower temperature for more consistent analysis
        max_tokens: 2000,
      });

      const analysisResult = this.parseAIResponse(response.choices[0].message.content);
      this.logger.debug("Content analysis completed successfully");

      return analysisResult;
    } catch (error) {
      this.logger.error(`Content analysis failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Predict viral potential of content before posting
   */
  async predictViralPotential(data: ViralPredictionData): Promise<any> {
    try {
      this.logger.debug(`Predicting viral potential for ${data.platform} content`);

      const systemPrompt = `You are Virlo AI's viral prediction engine. You specialize in predicting content performance before it's published by analyzing content elements, creator patterns, timing, and platform algorithms.

Your prediction accuracy is based on:
- Content quality and appeal factors
- Creator's historical performance patterns
- Platform algorithm preferences
- Optimal timing and audience behavior
- Trending topics and viral mechanics

Provide specific predictions with confidence scores and actionable recommendations.`;

      const userPrompt = `Predict the viral potential of this ${data.platform} content:

CONTENT TO PREDICT:
${JSON.stringify(data, null, 2)}

Provide prediction in this JSON format:
{
  "viralScore": {
    "overallScore": 0.0-1.0,
    "confidence": 0.0-1.0,
    "category": "viral|trending|average|below_average",
    "reasoning": "Why this score was assigned"
  },
  "performancePrediction": {
    "expectedViews": "view range",
    "expectedEngagement": "engagement range",
    "expectedShares": "share range",
    "timeToPeak": "estimated time to reach peak performance"
  },
  "viralFactors": {
    "strengths": [
      {
        "factor": "strength name",
        "impact": "high|medium|low",
        "description": "How this helps viral potential"
      }
    ],
    "weaknesses": [
      {
        "factor": "weakness name",
        "impact": "high|medium|low",
        "suggestion": "How to improve"
      }
    ]
  },
  "optimizationRecommendations": {
    "titleOptimization": "Suggested title improvements",
    "contentOptimization": "Suggested content improvements",
    "timingOptimization": "Suggested posting time",
    "hashtagOptimization": "Suggested hashtag strategy"
  },
  "riskAssessment": {
    "potentialRisks": ["risk1", "risk2"],
    "mitigationStrategies": ["strategy1", "strategy2"]
  }
}`;

      const response = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.2, // Very low temperature for consistent predictions
        max_tokens: 1500,
      });

      const predictionResult = this.parseAIResponse(response.choices[0].message.content);
      this.logger.debug("Viral prediction completed successfully");

      return predictionResult;
    } catch (error) {
      this.logger.error(`Viral prediction failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Analyze trends and identify opportunities
   */
  async analyzeTrends(data: TrendAnalysisData): Promise<any> {
    try {
      this.logger.debug(`Analyzing trends for ${data.platform} in ${data.niche || 'general'} niche`);

      const systemPrompt = `You are Virlo AI's trend analysis engine. You specialize in identifying emerging trends, analyzing competitor performance, and spotting opportunities before they become mainstream.

Your expertise includes:
- Early trend detection and validation
- Competitor analysis and gap identification
- Niche opportunity spotting
- Trend lifecycle prediction
- Strategic timing recommendations

Provide actionable trend insights with specific opportunities and implementation strategies.`;

      const userPrompt = `Analyze trends and opportunities for ${data.platform} content:

TREND DATA:
${JSON.stringify(data, null, 2)}

Provide trend analysis in this JSON format:
{
  "emergingTrends": [
    {
      "trend": "trend name",
      "growthRate": "rising|stable|declining",
      "opportunityLevel": "high|medium|low",
      "timeToPeak": "estimated time",
      "description": "What this trend is about",
      "contentOpportunities": ["opportunity1", "opportunity2"]
    }
  ],
  "competitorGaps": [
    {
      "gap": "gap description",
      "opportunitySize": "large|medium|small",
      "difficulty": "easy|medium|hard",
      "implementation": "How to capitalize on this gap"
    }
  ],
  "nicheOpportunities": [
    {
      "opportunity": "opportunity description",
      "marketSize": "large|medium|small",
      "competition": "low|medium|high",
      "entryStrategy": "How to enter this opportunity"
    }
  ],
  "contentStrategy": {
    "immediateActions": ["action1", "action2"],
    "mediumTermStrategy": ["strategy1", "strategy2"],
    "longTermVision": ["vision1", "vision2"]
  },
  "riskAssessment": {
    "trendRisks": ["risk1", "risk2"],
    "mitigationStrategies": ["strategy1", "strategy2"]
  }
}`;

      const response = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.4,
        max_tokens: 1800,
      });

      const trendResult = this.parseAIResponse(response.choices[0].message.content);
      this.logger.debug("Trend analysis completed successfully");

      return trendResult;
    } catch (error) {
      this.logger.error(`Trend analysis failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate advanced content ideas based on performance data
   */
  async generateAdvancedContentIdeas(data: ContentAnalysisData): Promise<any> {
    try {
      this.logger.debug(`Generating advanced content ideas for ${data.platform}`);

      const systemPrompt = `You are Virlo AI's content ideation engine. You specialize in generating innovative, data-driven content ideas that have high viral potential based on performance analysis.

Your ideation process includes:
- Analyzing successful content patterns
- Identifying content gaps and opportunities
- Creating unique twists on proven formats
- Considering platform-specific preferences
- Balancing creativity with data insights

Generate specific, actionable content ideas with implementation details.`;

      const userPrompt = `Generate advanced content ideas based on this ${data.platform} performance data:

PERFORMANCE DATA:
${JSON.stringify(data, null, 2)}

Provide content ideas in this JSON format:
{
  "contentIdeas": [
    {
      "title": "Content idea title",
      "type": "video|post|story|reel",
      "viralPotential": "high|medium|low",
      "confidence": 0.0-1.0,
      "description": "Detailed description of the content",
      "keyElements": ["element1", "element2"],
      "targetAudience": "Who this appeals to",
      "implementation": "Step-by-step implementation guide",
      "expectedOutcome": "Expected performance metrics"
    }
  ],
  "contentSeries": [
    {
      "seriesName": "Series title",
      "episodeCount": 0,
      "theme": "Series theme",
      "viralPotential": "high|medium|low",
      "description": "Series description",
      "episodeIdeas": ["episode1", "episode2"]
    }
  ],
  "collaborationIdeas": [
    {
      "collaborationType": "collaboration type",
      "targetCreators": ["creator1", "creator2"],
      "contentConcept": "Collaboration concept",
      "mutualBenefit": "Benefits for both parties"
    }
  ],
  "trendingFormats": [
    {
      "format": "Format name",
      "adaptation": "How to adapt for your content",
      "viralPotential": "high|medium|low",
      "implementation": "How to implement"
    }
  ]
}`;

      const response = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.6, // Higher temperature for creative ideas
        max_tokens: 2000,
      });

      const ideasResult = this.parseAIResponse(response.choices[0].message.content);
      this.logger.debug("Content ideas generation completed successfully");

      return ideasResult;
    } catch (error) {
      this.logger.error(`Content ideas generation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Parse AI response and handle errors gracefully
   */
  private parseAIResponse(response: string): any {
    try {
      // Try to extract JSON from the response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      this.logger.warn(`Failed to parse AI response as JSON: ${error.message}`);
    }

    // Fallback: return structured error response
    return {
      error: "Failed to parse AI response",
      rawResponse: response,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Handle OpenAI errors with specific error types
   */
  private handleOpenAIError(error: any): Error {
    if (error.code === "insufficient_quota") {
      this.logger.error("OpenAI API quota exceeded");
      return new Error("AI analysis quota exceeded. Please check your billing details.");
    }

    if (error.response?.status === 429) {
      this.logger.error("Rate limit exceeded");
      return new Error("AI analysis rate limit exceeded. Please try again later.");
    }

    this.logger.error("OpenAI API error:", error);
    return new Error(`AI analysis failed: ${error.message}`);
  }
}
