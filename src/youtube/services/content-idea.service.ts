import { Injectable, Logger } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { VideoAnalytics } from "../schemas/video-analytics.schema";
import { OpenAIService } from "../../openai/openai.service";

export interface ContentIdea {
  id: string;
  title: string;
  description: string;
  niche: string;
  potentialScore: number;
  contentType:
    | "tutorial"
    | "reaction"
    | "challenge"
    | "story"
    | "review"
    | "tips"
    | "transformation"
    | "comparison";
  targetAudience: string;
  hashtags: string[];
  estimatedDuration: number;
  inspirationVideos: Array<{
    videoId: string;
    title: string;
    views: number;
    engagementRate: number;
  }>;
  contentStructure: {
    hook: string;
    mainPoints: string[];
    callToAction: string;
  };
  trendingElements: string[];
  riskLevel: "low" | "medium" | "high";
  timeToCreate: "quick" | "medium" | "extensive";
  lastUpdated: Date;
}

export interface ContentIdeaGenerationOptions {
  niche?: string;
  contentType?: string;
  targetAudience?: string;
  maxDuration?: number;
  minPotentialScore?: number;
  limit?: number;
  userContext?: {
    topHashtags?: string[];
    averageViews?: number;
    averageEngagement?: number;
    recentTitles?: string[];
  };
}

@Injectable()
export class ContentIdeaService {
  private readonly logger = new Logger(ContentIdeaService.name);

  private readonly contentTypes = {
    tutorial: ["how to", "tutorial", "guide", "step by step", "learn"],
    reaction: ["reaction", "reacting to", "first time", "shocked"],
    challenge: ["challenge", "try this", "test", "experiment"],
    story: ["story", "experience", "journey", "what happened"],
    review: ["review", "honest", "truth about", "real thoughts"],
    tips: ["tips", "advice", "secrets", "hacks", "tricks"],
    transformation: ["before after", "transformation", "change", "progress"],
    comparison: ["vs", "comparison", "difference", "better than"],
  };

  private readonly audienceKeywords = {
    beginners: ["beginner", "new", "first time", "start"],
    intermediate: ["advanced", "pro", "expert", "master"],
    general: ["everyone", "anyone", "simple", "easy"],
  };

  constructor(
    @InjectModel("VideoAnalytics") private videoModel: Model<VideoAnalytics>,
    private readonly openAIService: OpenAIService,
  ) {}

  async generateContentIdeas(
    options: ContentIdeaGenerationOptions = {},
  ): Promise<ContentIdea[]> {
    const {
      niche,
      contentType,
      targetAudience,
      maxDuration = 60,
      minPotentialScore = 0.5,
      limit = 20,
    } = options;

    try {
      // Try OpenAI-powered generation first
      const aiIdeas = await this.generateAIContentIdeas(options);
      if (aiIdeas.length > 0) {
        this.logger.log(`Generated ${aiIdeas.length} AI-powered content ideas`);
        return aiIdeas.slice(0, limit);
      }

      // Fallback to database analysis
      this.logger.log("Falling back to database analysis for content ideas");
      const trendingVideos = await this.getTrendingVideos(niche);

      if (trendingVideos.length === 0) {
        return [];
      }

      // Analyze patterns and generate ideas
      const ideas = await this.analyzeAndGenerateIdeas(trendingVideos, options);

      // Filter and sort by potential score
      return ideas
        .filter((idea) => idea.potentialScore >= minPotentialScore)
        .sort((a, b) => b.potentialScore - a.potentialScore)
        .slice(0, limit);
    } catch (error) {
      this.logger.error("Error generating content ideas:", error);
      throw error;
    }
  }

  /**
   * Generate content ideas using OpenAI
   */
  private async generateAIContentIdeas(
    options: ContentIdeaGenerationOptions,
  ): Promise<ContentIdea[]> {
    try {
      const { niche, contentType, targetAudience, maxDuration = 60, limit = 20 } = options;

      // Create a comprehensive prompt for OpenAI
      const prompt = this.createContentIdeasPrompt(niche, contentType, targetAudience, maxDuration, options.userContext);

      this.logger.log("Generating content ideas with OpenAI");
      const aiResponse = await this.openAIService.generatePostIdea({ prompt });

      // Parse the AI response into structured ideas
      const ideas = this.parseAIResponse(aiResponse, options);

      this.logger.log(`Successfully parsed ${ideas.length} ideas from OpenAI response`);
      return ideas.slice(0, limit);
    } catch (error) {
      this.logger.warn("OpenAI content idea generation failed:", error.message);
      return [];
    }
  }

  /**
   * Create a comprehensive prompt for OpenAI content idea generation
   */
  private createContentIdeasPrompt(
    niche?: string,
    contentType?: string,
    targetAudience?: string,
    maxDuration?: number,
    userContext?: {
      topHashtags?: string[];
      averageViews?: number;
      averageEngagement?: number;
      recentTitles?: string[];
    }
  ): string {
    const nicheText = niche ? `in the ${niche} niche` : 'across various niches';
    const contentTypeText = contentType ? `focused on ${contentType} content` : 'covering different content types';
    const audienceText = targetAudience ? `targeting ${targetAudience} audience` : 'for general audiences';
    const durationText = maxDuration ? `with videos up to ${maxDuration} seconds long` : '';

    // Create niche-specific context
    const nicheContext = this.getNicheContext(niche);

    // Add user-specific context
    let userContextText = '';
    if (userContext) {
      userContextText = `

USER'S ACTUAL CONTENT CONTEXT:
- Top performing hashtags: ${userContext.topHashtags?.join(', ') || 'None available'}
- Average views per video: ${userContext.averageViews?.toLocaleString() || 'Unknown'}
- Average engagement rate: ${userContext.averageEngagement?.toFixed(1)}% || 'Unknown'}
- Recent video titles: ${userContext.recentTitles?.join(' | ') || 'None available'}

IMPORTANT: Use this context to create ideas that match the user's actual content style and performance patterns.`;
    }

    return `You are a professional content strategist and social media expert specializing in ${niche || 'various'} content. Generate exactly 5 creative and engaging content ideas for TikTok/YouTube creators ${nicheText} ${contentTypeText} ${audienceText} ${durationText}.

${nicheContext}${userContextText}

IMPORTANT: Respond ONLY with valid JSON. No explanations, no markdown, no additional text. Just the JSON array.

For each idea, provide:
1. Title (engaging and click-worthy)
2. Description (brief explanation of the content)
3. Content type (tutorial, reaction, challenge, story, review, tips, transformation, comparison)
4. Target audience (beginners, intermediate, general)
5. Hashtags (5 relevant hashtags)
6. Estimated duration (in seconds)
7. Potential score (0.1 to 1.0 based on viral potential)
8. Risk level (low, medium, high)
9. Time to create (quick, medium, extensive)
10. Content structure (hook, main points, call to action)

Respond with ONLY this JSON format (no other text):
[
  {
    "title": "Engaging Title Here",
    "description": "Brief description of the content idea",
    "contentType": "tutorial",
    "targetAudience": "beginners",
    "hashtags": ["#hashtag1", "#hashtag2", "#hashtag3", "#hashtag4", "#hashtag5"],
    "estimatedDuration": 45,
    "potentialScore": 0.8,
    "riskLevel": "medium",
    "timeToCreate": "medium",
    "contentStructure": {
      "hook": "Opening hook to grab attention",
      "mainPoints": ["Point 1", "Point 2", "Point 3"],
      "callToAction": "Engaging call to action"
    }
  }
]

Requirements:
- Exactly 5 ideas
- Valid JSON only
- No trailing commas
- Escape all quotes properly
- Keep descriptions short and clear
<<<<<<< HEAD
- Make ideas creative and viral-worthy
- Ideas must be relevant to the ${niche || 'specified'} niche
- Consider the user's actual content performance and style`;
  }

  /**
   * Get niche-specific context for better content ideas
   */
  private getNicheContext(niche?: string): string {
    const contexts = {
      'real-estate': `Focus on property tours, real estate tips, market analysis, home buying guides, investment strategies, and property comparisons. Consider trending topics like luxury homes, first-time buyer tips, market trends, and property investment advice.`,
      'fitness': `Focus on workout routines, fitness tips, transformation stories, exercise tutorials, nutrition advice, and motivational content. Consider trending topics like home workouts, fitness challenges, and health tips.`,
      'food+drink': `Focus on cooking tutorials, recipe sharing, food reviews, restaurant visits, culinary tips, and food challenges. Consider trending topics like quick recipes, food hacks, and cooking techniques.`,
      'gaming': `Focus on gameplay, game reviews, gaming tips, esports content, gaming news, and gaming challenges. Consider trending topics like new game releases, gaming setups, and gaming culture.`,
      'technology': `Focus on tech reviews, gadget unboxings, tech tutorials, tech news, and tech comparisons. Consider trending topics like new releases, tech tips, and technology explanations.`,
      'beauty': `Focus on makeup tutorials, skincare routines, beauty reviews, beauty tips, and beauty transformations. Consider trending topics like makeup challenges, skincare tips, and beauty hacks.`,
      'education': `Focus on tutorials, educational content, skill development, learning tips, and knowledge sharing. Consider trending topics like study tips, learning techniques, and educational challenges.`,
      'entertainment': `Focus on comedy, reactions, entertainment news, celebrity content, and fun challenges. Consider trending topics like viral trends, entertainment reactions, and comedy skits.`,
      'business': `Focus on business tips, entrepreneurship advice, career guidance, and professional development. Consider trending topics like business strategies, career advice, and entrepreneurial stories.`,
      'relationships': `Focus on dating advice, relationship tips, love stories, and relationship guidance. Consider trending topics like dating tips, relationship advice, and love stories.`,
      'finance': `Focus on financial advice, investment tips, money management, and financial education. Consider trending topics like investment strategies, financial tips, and money advice.`,
      'crypto': `Focus on cryptocurrency news, trading tips, blockchain education, and crypto analysis. Consider trending topics like crypto investments, blockchain technology, and cryptocurrency education.`,
    };

    return contexts[niche] || `Focus on creating engaging, viral-worthy content that resonates with your target audience. Consider trending topics, challenges, and formats that work well on social media platforms.`;
  }

  /**
   * Parse OpenAI response into structured content ideas
   */
  private parseAIResponse(aiResponse: string, options: ContentIdeaGenerationOptions): ContentIdea[] {
    try {
      // Clean the response first
      let cleanedResponse = aiResponse.trim();

      // Remove any markdown code blocks
      cleanedResponse = cleanedResponse.replace(/```json\s*/g, '').replace(/```\s*/g, '');

      // Try multiple parsing strategies
      const ideas = this.tryParseJSON(cleanedResponse);

      if (!ideas || !Array.isArray(ideas) || ideas.length === 0) {
        this.logger.warn("No valid ideas found in OpenAI response");
        return this.generateFallbackIdeasFromText(aiResponse, options);
      }

      this.logger.log(`Successfully parsed ${ideas.length} ideas from OpenAI response`);

      return ideas.map((idea, index) => ({
        id: this.generateIdeaId(),
        title: idea.title || `AI Generated Idea ${index + 1}`,
        description: idea.description || "AI-generated content idea",
        niche: options.niche || "general",
        potentialScore: Math.min(1, Math.max(0.1, idea.potentialScore || 0.7)),
        contentType: idea.contentType || "tips",
        targetAudience: idea.targetAudience || "general",
        hashtags: Array.isArray(idea.hashtags) ? idea.hashtags : ["#content", "#viral"],
        estimatedDuration: idea.estimatedDuration || 60,
        inspirationVideos: [],
        contentStructure: idea.contentStructure || {
          hook: "Grab attention with an interesting opening",
          mainPoints: ["Main point 1", "Main point 2", "Main point 3"],
          callToAction: "Engage with your audience"
        },
        trendingElements: idea.hashtags || ["#trending"],
        riskLevel: idea.riskLevel || "medium",
        timeToCreate: idea.timeToCreate || "medium",
        lastUpdated: new Date(),
      }));
    } catch (error) {
      this.logger.warn("Failed to parse OpenAI JSON response:", error.message);
      return this.generateFallbackIdeasFromText(aiResponse, options);
    }
  }

  /**
   * Fix common JSON issues in OpenAI responses
   */
  private fixCommonJSONIssues(jsonString: string): string {
    try {
      // Remove any leading/trailing whitespace
      jsonString = jsonString.trim();

      // Fix trailing commas before closing brackets/braces
      jsonString = jsonString.replace(/,(\s*[}\]])/g, '$1');

      // Fix missing quotes around object keys
      jsonString = jsonString.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');

      // Fix single quotes to double quotes (but be careful with apostrophes in text)
      jsonString = jsonString.replace(/'/g, '"');

      // Fix unescaped quotes in string values
      jsonString = jsonString.replace(/"([^"]*)"([^"]*)"([^"]*)":/g, '"$1\\"$2\\"$3":');

      // Fix newlines and carriage returns in strings
      jsonString = jsonString.replace(/\\n/g, ' ');
      jsonString = jsonString.replace(/\\r/g, '');
      jsonString = jsonString.replace(/\n/g, ' ');
      jsonString = jsonString.replace(/\r/g, '');

      // Fix any remaining unescaped quotes in string values
      jsonString = jsonString.replace(/"([^"]*)"([^"]*)"([^"]*)"/g, '"$1\\"$2\\"$3"');

      return jsonString;
    } catch (error) {
      this.logger.warn('Error fixing JSON issues:', error.message);
      return jsonString;
    }
  }

  /**
   * Try to extract and parse JSON with multiple strategies
   */
  private tryParseJSON(jsonString: string): any[] | null {
    const strategies = [
      // Strategy 1: Direct parse
      () => JSON.parse(jsonString),

      // Strategy 2: Fix common issues then parse
      () => JSON.parse(this.fixCommonJSONIssues(jsonString)),

      // Strategy 3: Extract array from text
      () => {
        const arrayMatch = jsonString.match(/\[[\s\S]*\]/);
        if (arrayMatch) {
          return JSON.parse(this.fixCommonJSONIssues(arrayMatch[0]));
        }
        throw new Error('No array found');
      },

      // Strategy 4: Try to find valid JSON blocks
      () => {
        const blocks = jsonString.split(/[\[\]]/);
        for (const block of blocks) {
          try {
            const testJson = `[${block}]`;
            return JSON.parse(this.fixCommonJSONIssues(testJson));
          } catch (e) {
            continue;
          }
        }
        throw new Error('No valid JSON blocks found');
      }
    ];

    for (let i = 0; i < strategies.length; i++) {
      try {
        const result = strategies[i]();
        if (Array.isArray(result) && result.length > 0) {
          this.logger.log(`Successfully parsed JSON using strategy ${i + 1}`);
          return result;
        }
      } catch (error) {
        this.logger.debug(`Strategy ${i + 1} failed:`, error.message);
        continue;
      }
    }

    return null;
  }

  /**
   * Generate fallback ideas from text response when JSON parsing fails
   */
  private generateFallbackIdeasFromText(text: string, options: ContentIdeaGenerationOptions): ContentIdea[] {
    const ideas: ContentIdea[] = [];
    const lines = text.split('\n').filter(line => line.trim().length > 0);

    let currentIdea: Partial<ContentIdea> = {};
    let ideaIndex = 0;

    for (const line of lines) {
      const trimmedLine = line.trim();

      if (trimmedLine.match(/^\d+\./)) {
        // New idea starting
        if (currentIdea.title) {
          ideas.push(this.completeIdea(currentIdea, ideaIndex++, options));
        }
        currentIdea = { title: trimmedLine.replace(/^\d+\.\s*/, '') };
      } else if (trimmedLine.toLowerCase().includes('description') && currentIdea.title) {
        currentIdea.description = trimmedLine.replace(/description:?\s*/i, '');
      } else if (trimmedLine.toLowerCase().includes('hashtag') && currentIdea.title) {
        const hashtagText = trimmedLine.replace(/hashtag[s]?:?\s*/i, '');
        currentIdea.hashtags = hashtagText.split(/[,\s]+/).filter(tag => tag.startsWith('#'));
      }
    }

    // Add the last idea
    if (currentIdea.title) {
      ideas.push(this.completeIdea(currentIdea, ideaIndex, options));
    }

    // If no ideas were extracted from text, generate default ideas
    if (ideas.length === 0) {
      return this.generateDefaultContentIdeas(options);
    }

    return ideas.slice(0, 10);
  }

  /**
   * Generate default content ideas when all parsing fails
   */
  private generateDefaultContentIdeas(options: ContentIdeaGenerationOptions): ContentIdea[] {
    const defaultIdeas = [
      {
        title: "Behind the Scenes Content",
        description: "Show your audience what goes on behind the scenes of your content creation process",
        contentType: "story",
        hashtags: ["#behindthescenes", "#contentcreation", "#viral", "#trending", "#creator"],
      },
      {
        title: "Quick Tips Tutorial",
        description: "Share a quick, actionable tip that your audience can implement immediately",
        contentType: "tutorial",
        hashtags: ["#tips", "#tutorial", "#quicktips", "#helpful", "#education"],
      },
      {
        title: "Trending Challenge",
        description: "Participate in or create a trending challenge that fits your niche",
        contentType: "challenge",
        hashtags: ["#challenge", "#trending", "#viral", "#fun", "#engagement"],
      },
      {
        title: "Day in My Life",
        description: "Share a typical day in your life to connect with your audience",
        contentType: "story",
        hashtags: ["#dayinmylife", "#lifestyle", "#vlog", "#personal", "#relatable"],
      },
      {
        title: "Reaction Video",
        description: "React to trending content or news in your niche",
        contentType: "reaction",
        hashtags: ["#reaction", "#trending", "#opinion", "#discussion", "#engagement"],
      }
    ];

    return defaultIdeas.map((idea, index) => ({
      id: this.generateIdeaId(),
      title: idea.title,
      description: idea.description,
      niche: options.niche || "general",
      potentialScore: 0.7,
      contentType: idea.contentType as any,
      targetAudience: options.targetAudience || "general",
      hashtags: idea.hashtags,
      estimatedDuration: options.maxDuration || 60,
      inspirationVideos: [],
      contentStructure: {
        hook: "Grab attention with an interesting opening",
        mainPoints: ["Main point 1", "Main point 2", "Main point 3"],
        callToAction: "Engage with your audience"
      },
      trendingElements: ["#trending", "#viral"],
      riskLevel: "medium",
      timeToCreate: "medium",
      lastUpdated: new Date(),
    }));
  }

  /**
   * Complete a partial idea with default values
   */
  private completeIdea(partialIdea: Partial<ContentIdea>, index: number, options: ContentIdeaGenerationOptions): ContentIdea {
    return {
      id: this.generateIdeaId(),
      title: partialIdea.title || `AI Generated Idea ${index + 1}`,
      description: partialIdea.description || "AI-generated content idea based on current trends",
      niche: options.niche || "general",
      potentialScore: 0.7,
      contentType: "tips",
      targetAudience: options.targetAudience || "general",
      hashtags: partialIdea.hashtags || ["#content", "#viral", "#trending"],
      estimatedDuration: options.maxDuration || 60,
      inspirationVideos: [],
      contentStructure: {
        hook: "Grab attention with an interesting opening",
        mainPoints: ["Main point 1", "Main point 2", "Main point 3"],
        callToAction: "Engage with your audience"
      },
      trendingElements: ["#trending", "#viral"],
      riskLevel: "medium",
      timeToCreate: "medium",
      lastUpdated: new Date(),
    };
  }

  private async getTrendingVideos(niche?: string) {
    const query: any = {
      publishedAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      viewCount: { $gte: 1000 },
      engagementRate: { $gte: 2 },
    };

    if (niche) {
      query.niche = new RegExp(niche, "i");
    }

    return this.videoModel
      .find(query)
      .sort({ engagementRate: -1, viewCount: -1 })
      .limit(100)
      .lean();
  }

  private async analyzeAndGenerateIdeas(
    videos: any[],
    options: ContentIdeaGenerationOptions,
  ): Promise<ContentIdea[]> {
    const ideas: ContentIdea[] = [];
    const { contentType, targetAudience, maxDuration } = options;

    // Group videos by content type
    const videosByType = this.groupVideosByType(videos);

    // Generate ideas for each content type
    for (const [type, typeVideos] of Object.entries(videosByType)) {
      if (contentType && type !== contentType) continue;

      const typeIdeas = this.generateIdeasForType(type, typeVideos, options);
      ideas.push(...typeIdeas);
    }

    // Generate cross-niche ideas
    const crossNicheIdeas = this.generateCrossNicheIdeas(videos, options);
    ideas.push(...crossNicheIdeas);

    // Generate trend-based ideas
    const trendIdeas = this.generateTrendBasedIdeas(videos, options);
    ideas.push(...trendIdeas);

    return ideas;
  }

  private groupVideosByType(videos: any[]): Record<string, any[]> {
    const grouped: Record<string, any[]> = {};

    videos.forEach((video) => {
      const type = this.detectContentType(video);
      if (!grouped[type]) {
        grouped[type] = [];
      }
      grouped[type].push(video);
    });

    return grouped;
  }

  private detectContentType(video: any): string {
    const title = (video.title || "").toLowerCase();
    const description = (video.description || "").toLowerCase();

    for (const [type, keywords] of Object.entries(this.contentTypes)) {
      if (
        keywords.some(
          (keyword) => title.includes(keyword) || description.includes(keyword),
        )
      ) {
        return type;
      }
    }

    return "general";
  }

  private generateIdeasForType(
    type: string,
    videos: any[],
    options: ContentIdeaGenerationOptions,
  ): ContentIdea[] {
    const ideas: ContentIdea[] = [];
    const { targetAudience, maxDuration } = options;

    // Analyze successful patterns in this content type
    const patterns = this.analyzeContentPatterns(videos);

    // Generate variations based on patterns
    for (const pattern of patterns) {
      const idea = this.createIdeaFromPattern(pattern, type, videos, options);
      if (idea) {
        ideas.push(idea);
      }
    }

    // Generate audience-specific ideas
    if (targetAudience) {
      const audienceIdeas = this.generateAudienceSpecificIdeas(
        type,
        videos,
        targetAudience,
        options,
      );
      ideas.push(...audienceIdeas);
    }

    return ideas;
  }

  private analyzeContentPatterns(videos: any[]): any[] {
    const patterns = [];

    // Analyze title patterns
    const titlePatterns = this.extractTitlePatterns(videos);
    patterns.push(...titlePatterns);

    // Analyze hashtag patterns
    const hashtagPatterns = this.extractHashtagPatterns(videos);
    patterns.push(...hashtagPatterns);

    // Analyze duration patterns
    const durationPatterns = this.extractDurationPatterns(videos);
    patterns.push(...durationPatterns);

    return patterns;
  }

  private extractTitlePatterns(videos: any[]): any[] {
    const patterns = [];
    const titles = videos.map((v) => v.title || "");

    // Find common title structures
    const titleStructures = [
      { pattern: /^(\d+)\s+(.+)/, type: "numbered_list" },
      { pattern: /^(.+)\s+vs\s+(.+)/, type: "comparison" },
      { pattern: /^(.+)\s+review/i, type: "review" },
      { pattern: /^(.+)\s+challenge/i, type: "challenge" },
      { pattern: /^(.+)\s+tutorial/i, type: "tutorial" },
    ];

    for (const structure of titleStructures) {
      const matches = titles.filter((title) => structure.pattern.test(title));
      if (matches.length > 0) {
        patterns.push({
          type: structure.type,
          examples: matches.slice(0, 3),
          frequency: matches.length,
        });
      }
    }

    return patterns;
  }

  private extractHashtagPatterns(videos: any[]): any[] {
    const hashtagMap = new Map<string, number>();

    videos.forEach((video) => {
      const hashtags = video.hashtags || [];
      hashtags.forEach((tag) => {
        hashtagMap.set(tag, (hashtagMap.get(tag) || 0) + 1);
      });
    });

    return Array.from(hashtagMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tag, count]) => ({
        type: "hashtag",
        tag,
        frequency: count,
      }));
  }

  private extractDurationPatterns(videos: any[]): any[] {
    const durations = videos.map((v) => v.duration || 0).filter((d) => d > 0);

    if (durations.length === 0) return [];

    const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
    const optimalRanges = [
      { min: 0, max: 15, label: "ultra_short" },
      { min: 15, max: 30, label: "short" },
      { min: 30, max: 60, label: "medium" },
      { min: 60, max: 120, label: "long" },
    ];

    const rangeCounts = optimalRanges.map((range) => ({
      range: range.label,
      count: durations.filter((d) => d >= range.min && d < range.max).length,
    }));

    return rangeCounts.filter((r) => r.count > 0);
  }

  private createIdeaFromPattern(
    pattern: any,
    type: string,
    videos: any[],
    options: ContentIdeaGenerationOptions,
  ): ContentIdea | null {
    const { maxDuration } = options;

    // Calculate potential score based on pattern success
    const potentialScore = this.calculatePotentialScore(pattern, videos);

    if (potentialScore < 0.3) return null;

    const idea: ContentIdea = {
      id: this.generateIdeaId(),
      title: this.generateTitleFromPattern(pattern, type),
      description: this.generateDescriptionFromPattern(pattern, type),
      niche: this.detectNicheFromVideos(videos),
      potentialScore,
      contentType: type as any,
      targetAudience: this.detectTargetAudience(pattern, videos),
      hashtags: this.generateHashtagsFromPattern(pattern, videos),
      estimatedDuration: this.estimateDuration(pattern, maxDuration),
      inspirationVideos: this.getInspirationVideos(videos, pattern),
      contentStructure: this.generateContentStructure(pattern, type),
      trendingElements: this.extractTrendingElements(pattern, videos),
      riskLevel: this.assessRiskLevel(pattern, videos),
      timeToCreate: this.estimateTimeToCreate(pattern, type),
      lastUpdated: new Date(),
    };

    return idea;
  }

  private calculatePotentialScore(pattern: any, videos: any[]): number {
    const relevantVideos = videos.filter((v) =>
      this.videoMatchesPattern(v, pattern),
    );

    if (relevantVideos.length === 0) return 0;

    const avgViews =
      relevantVideos.reduce((sum, v) => sum + v.viewCount, 0) /
      relevantVideos.length;
    const avgEngagement =
      relevantVideos.reduce((sum, v) => sum + v.engagementRate, 0) /
      relevantVideos.length;

    // Normalize scores (0-1)
    const maxViews = Math.max(...videos.map((v) => v.viewCount));
    const maxEngagement = Math.max(...videos.map((v) => v.engagementRate));

    const viewScore = avgViews / maxViews;
    const engagementScore = avgEngagement / maxEngagement;

    return viewScore * 0.6 + engagementScore * 0.4;
  }

  private videoMatchesPattern(video: any, pattern: any): boolean {
    // Simple pattern matching logic
    if (pattern.type === "hashtag") {
      return (video.hashtags || []).includes(pattern.tag);
    }

    if (pattern.type === "numbered_list") {
      return /^\d+/.test(video.title || "");
    }

    return true; // Default match
  }

  private generateTitleFromPattern(pattern: any, type: string): string {
    const templates = {
      numbered_list: [
        "5 {topic} Tips That Actually Work",
        "3 {topic} Mistakes You're Making",
        "7 {topic} Secrets Revealed",
      ],
      comparison: [
        "{topic1} vs {topic2}: Which is Better?",
        "{topic1} vs {topic2}: The Truth",
      ],
      review: [
        "Honest {topic} Review",
        "Is {topic} Worth It?",
        "The Truth About {topic}",
      ],
      challenge: [
        "{topic} Challenge",
        "Can You {topic}?",
        "The Ultimate {topic} Test",
      ],
      tutorial: [
        "How to {topic} (Step by Step)",
        "{topic} Tutorial for Beginners",
        "Master {topic} in 5 Minutes",
      ],
    };

    const typeTemplates = templates[type] || templates.tutorial;
    const template =
      typeTemplates[Math.floor(Math.random() * typeTemplates.length)];

    // Replace placeholders with actual topics
    return template.replace(/\{topic\}/g, this.getRandomTopic());
  }

  private generateDescriptionFromPattern(pattern: any, type: string): string {
    const descriptions = {
      numbered_list:
        "Discover the most effective strategies and avoid common mistakes.",
      comparison:
        "Get the real comparison and find out which option is best for you.",
      review:
        "An honest, unbiased review based on real experience and research.",
      challenge: "Test your skills and see if you can complete this challenge.",
      tutorial:
        "Learn step-by-step with practical examples and actionable tips.",
    };

    return (
      descriptions[type] ||
      "Engaging content that provides real value to viewers."
    );
  }

  private detectNicheFromVideos(videos: any[]): string {
    const niches = videos.map((v) => v.niche).filter((n) => n);
    if (niches.length === 0) return "general";

    // Return most common niche
    const nicheCounts = niches.reduce(
      (acc, niche) => {
        acc[niche] = (acc[niche] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    const sortedEntries = Object.entries(nicheCounts).sort(
      (a, b) => (b[1] as number) - (a[1] as number),
    );
    return sortedEntries[0] ? sortedEntries[0][0] : "general";
  }

  private detectTargetAudience(pattern: any, videos: any[]): string {
    const titles = videos
      .map((v) => v.title || "")
      .join(" ")
      .toLowerCase();

    for (const [audience, keywords] of Object.entries(this.audienceKeywords)) {
      if (keywords.some((keyword) => titles.includes(keyword))) {
        return audience;
      }
    }

    return "general";
  }

  private generateHashtagsFromPattern(pattern: any, videos: any[]): string[] {
    const hashtags = new Set<string>();

    videos.forEach((video) => {
      const videoHashtags = video.hashtags || [];
      videoHashtags.forEach((tag) => hashtags.add(tag));
    });

    return Array.from(hashtags).slice(0, 5);
  }

  private estimateDuration(pattern: any, maxDuration: number): number {
    // Estimate based on content type and pattern
    const baseDurations = {
      numbered_list: 45,
      comparison: 60,
      review: 90,
      challenge: 30,
      tutorial: 120,
    };

    const baseDuration = baseDurations[pattern.type] || 60;
    return Math.min(baseDuration, maxDuration);
  }

  private getInspirationVideos(
    videos: any[],
    pattern: any,
  ): Array<{
    videoId: string;
    title: string;
    views: number;
    engagementRate: number;
  }> {
    const relevantVideos = videos.filter((v) =>
      this.videoMatchesPattern(v, pattern),
    );

    return relevantVideos
      .sort((a, b) => b.viewCount - a.viewCount)
      .slice(0, 3)
      .map((v) => ({
        videoId: v.videoId,
        title: v.title,
        views: v.viewCount,
        engagementRate: v.engagementRate,
      }));
  }

  private generateContentStructure(
    pattern: any,
    type: string,
  ): { hook: string; mainPoints: string[]; callToAction: string } {
    const structures = {
      numbered_list: {
        hook: "Start with a surprising statistic or question",
        mainPoints: [
          "Point 1 with example",
          "Point 2 with demonstration",
          "Point 3 with results",
        ],
        callToAction: "Try these tips and let me know your results!",
      },
      comparison: {
        hook: "Present the dilemma or choice",
        mainPoints: [
          "Pros and cons of option A",
          "Pros and cons of option B",
          "Direct comparison",
        ],
        callToAction: "Which option do you prefer? Comment below!",
      },
      review: {
        hook: "Show the product/service upfront",
        mainPoints: ["First impressions", "Detailed testing", "Final verdict"],
        callToAction: "Have you tried this? Share your experience!",
      },
      challenge: {
        hook: "Explain the challenge rules",
        mainPoints: [
          "Attempt the challenge",
          "Show progress/struggles",
          "Final result",
        ],
        callToAction: "Try this challenge and tag me!",
      },
      tutorial: {
        hook: "Show the end result first",
        mainPoints: [
          "Step 1: Preparation",
          "Step 2: Main process",
          "Step 3: Final touches",
        ],
        callToAction: "Follow along and show me your results!",
      },
    };

    return structures[type] || structures.tutorial;
  }

  private extractTrendingElements(pattern: any, videos: any[]): string[] {
    const elements = [];

    // Extract trending hashtags
    const hashtags = videos.flatMap((v) => v.hashtags || []);
    const trendingHashtags = this.getMostFrequent(hashtags, 3);
    elements.push(...trendingHashtags);

    // Extract trending topics
    const titles = videos.map((v) => v.title || "");
    const words = titles.flatMap((title) => title.toLowerCase().split(/\s+/));
    const trendingWords = this.getMostFrequent(
      words.filter((w) => w.length > 3),
      3,
    );
    elements.push(...trendingWords);

    return elements;
  }

  private assessRiskLevel(
    pattern: any,
    videos: any[],
  ): "low" | "medium" | "high" {
    const relevantVideos = videos.filter((v) =>
      this.videoMatchesPattern(v, pattern),
    );

    if (relevantVideos.length === 0) return "high";

    const avgViews =
      relevantVideos.reduce((sum, v) => sum + v.viewCount, 0) /
      relevantVideos.length;
    const avgEngagement =
      relevantVideos.reduce((sum, v) => sum + v.engagementRate, 0) /
      relevantVideos.length;

    if (avgViews > 10000 && avgEngagement > 5) return "low";
    if (avgViews > 5000 && avgEngagement > 3) return "medium";
    return "high";
  }

  private estimateTimeToCreate(
    pattern: any,
    type: string,
  ): "quick" | "medium" | "extensive" {
    const timeEstimates = {
      numbered_list: "quick",
      comparison: "medium",
      review: "medium",
      challenge: "quick",
      tutorial: "extensive",
    };

    return timeEstimates[type] || "medium";
  }

  private generateCrossNicheIdeas(
    videos: any[],
    options: ContentIdeaGenerationOptions,
  ): ContentIdea[] {
    // Generate ideas that combine multiple niches
    const ideas: ContentIdea[] = [];

    // Find videos that perform well across niches
    const crossNicheVideos = videos.filter((v) => v.engagementRate > 5);

    if (crossNicheVideos.length > 0) {
      const idea: ContentIdea = {
        id: this.generateIdeaId(),
        title: "Cross-Niche Content: The Ultimate Guide",
        description:
          "Create content that appeals to multiple audiences simultaneously.",
        niche: "cross_niche",
        potentialScore: 0.8,
        contentType: "tutorial",
        targetAudience: "general",
        hashtags: ["crossniche", "multiaudience", "viral"],
        estimatedDuration: 60,
        inspirationVideos: this.getInspirationVideos(crossNicheVideos, {
          type: "cross_niche",
        }),
        contentStructure: {
          hook: "Show how one topic connects to multiple audiences",
          mainPoints: [
            "Identify common interests",
            "Create universal appeal",
            "Optimize for multiple niches",
          ],
          callToAction: "What cross-niche content would you create?",
        },
        trendingElements: ["viral", "trending", "popular"],
        riskLevel: "medium",
        timeToCreate: "extensive",
        lastUpdated: new Date(),
      };

      ideas.push(idea);
    }

    return ideas;
  }

  private generateTrendBasedIdeas(
    videos: any[],
    options: ContentIdeaGenerationOptions,
  ): ContentIdea[] {
    // Generate ideas based on current trends
    const ideas: ContentIdea[] = [];

    // Analyze trending topics
    const trendingTopics = this.extractTrendingTopics(videos);

    for (const topic of trendingTopics.slice(0, 3)) {
      const idea: ContentIdea = {
        id: this.generateIdeaId(),
        title: `Trending: ${topic.title}`,
        description: `Capitalize on the current trend of ${topic.title}`,
        niche: topic.niche || "trending",
        potentialScore: topic.score,
        contentType: "reaction",
        targetAudience: "general",
        hashtags: [...topic.hashtags, "trending", "viral"],
        estimatedDuration: 45,
        inspirationVideos: topic.videos,
        contentStructure: {
          hook: `React to the trending ${topic.title}`,
          mainPoints: [
            "Show the trend",
            "Share your thoughts",
            "Add your perspective",
          ],
          callToAction: "What do you think about this trend?",
        },
        trendingElements: [topic.title, "trending", "viral"],
        riskLevel: "medium",
        timeToCreate: "quick",
        lastUpdated: new Date(),
      };

      ideas.push(idea);
    }

    return ideas;
  }

  private extractTrendingTopics(videos: any[]): Array<{
    title: string;
    niche: string;
    score: number;
    hashtags: string[];
    videos: any[];
  }> {
    const topics = new Map<
      string,
      {
        count: number;
        totalViews: number;
        hashtags: Set<string>;
        videos: any[];
      }
    >();

    videos.forEach((video) => {
      const words = (video.title || "").toLowerCase().split(/\s+/);
      words.forEach((word) => {
        if (word.length > 3) {
          const existing = topics.get(word) || {
            count: 0,
            totalViews: 0,
            hashtags: new Set(),
            videos: [],
          };
          existing.count++;
          existing.totalViews += video.viewCount || 0;
          (video.hashtags || []).forEach((tag) => existing.hashtags.add(tag));
          existing.videos.push(video);
          topics.set(word, existing);
        }
      });
    });

    return Array.from(topics.entries())
      .filter(([_, data]) => data.count > 1)
      .map(([word, data]) => ({
        title: word,
        niche: this.detectNicheFromVideos(data.videos),
        score: data.totalViews / data.count / 1000, // Normalize score
        hashtags: Array.from(data.hashtags).slice(0, 5),
        videos: data.videos.slice(0, 3),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }

  private generateAudienceSpecificIdeas(
    type: string,
    videos: any[],
    audience: string,
    options: ContentIdeaGenerationOptions,
  ): ContentIdea[] {
    const ideas: ContentIdea[] = [];

    const audienceVideos = videos.filter((v) => {
      const title = (v.title || "").toLowerCase();
      const keywords = this.audienceKeywords[audience] || [];
      return keywords.some((keyword) => title.includes(keyword));
    });

    if (audienceVideos.length > 0) {
      const idea: ContentIdea = {
        id: this.generateIdeaId(),
        title: `${audience.charAt(0).toUpperCase() + audience.slice(1)}-Focused ${type.charAt(0).toUpperCase() + type.slice(1)}`,
        description: `Create content specifically tailored for ${audience}`,
        niche: this.detectNicheFromVideos(audienceVideos),
        potentialScore: 0.7,
        contentType: type as any,
        targetAudience: audience,
        hashtags: [audience, type, "targeted"],
        estimatedDuration: 60,
        inspirationVideos: this.getInspirationVideos(audienceVideos, { type }),
        contentStructure: {
          hook: `Address ${audience} specifically`,
          mainPoints: [
            "Understand their needs",
            "Provide targeted solutions",
            "Show results",
          ],
          callToAction: `Are you a ${audience}? This is for you!`,
        },
        trendingElements: [audience, type],
        riskLevel: "low",
        timeToCreate: "medium",
        lastUpdated: new Date(),
      };

      ideas.push(idea);
    }

    return ideas;
  }

  private getMostFrequent(items: string[], count: number): string[] {
    const frequency = new Map<string, number>();
    items.forEach((item) => {
      frequency.set(item, (frequency.get(item) || 0) + 1);
    });

    return Array.from(frequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, count)
      .map(([item]) => item);
  }

  private getRandomTopic(): string {
    const topics = [
      "content creation",
      "social media",
      "productivity",
      "fitness",
      "cooking",
      "technology",
      "fashion",
      "beauty",
      "travel",
      "education",
      "entertainment",
    ];
    return topics[Math.floor(Math.random() * topics.length)];
  }

  private generateIdeaId(): string {
    return `idea_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
