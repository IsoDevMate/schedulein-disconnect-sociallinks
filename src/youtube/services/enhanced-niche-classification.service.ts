import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import { VideoAnalytics } from '../schemas/video-analytics.schema';
import { OpenAIService } from '../../openai/openai.service';

export interface NicheDefinition {
  niche_type: string;
  description: string;
  ai_description: string;
  keywords: string[];
  label: string;
  is_active: boolean;
  created_date: string;
  sub_niches?: string[];
  content_types?: string[];
  target_audience?: string[];
  engagement_patterns?: string[];
  viral_factors?: string[];
  competitive_landscape?: string[];
}

export interface ContentAnalysisResult {
  niche: string;
  confidence: number;
  detectedTopics: string[];
  contentIntent: string[];
  audienceType: string;
  engagementPatterns: string[];
  recommendations: string[];
  aiInsights: string;
  subNiche?: string;
  contentType?: string;
  targetAudience?: string;
  viralPotential?: number;
  competitiveAdvantage?: string[];
  contentGaps?: string[];
}

export interface NicheClassificationResult {
  videoId: string;
  title: string;
  classifications: ContentAnalysisResult[];
  primaryNiche: string;
  confidence: number;
  aiSummary: string;
  recommendations: string[];
  marketOpportunity: string;
  contentStrategy: string;
}

@Injectable()
export class EnhancedNicheClassificationService {
  private readonly logger = new Logger(EnhancedNicheClassificationService.name);
  private readonly youtube = google.youtube('v3');

  // Comprehensive niche definitions based on real YouTube data
  private readonly NICHE_DEFINITIONS: Record<string, NicheDefinition> = {
    'food+drink': {
      niche_type: 'food+drink',
      description: 'For food enthusiasts, from recipes to culinary arts and beverage creations.',
      ai_description: 'Examine metadata (title, description, hashtags) for keywords such as "cooking," "recipe," "food review," "baking," "cuisine," "cocktail," or specific dish/drink names. In transcripts/comments, identify discussions about ingredients, cooking methods, restaurant experiences, beverage pairings, or kitchen tools.',
      keywords: ['cooking', 'cook with me', 'recipe', 'how to make', 'food review', 'restaurant', 'baking', 'cuisine', 'culinary', 'food vlog', 'mukbang', 'drink recipe', 'cocktail', 'wine tasting'],
      label: 'Food&Drink',
      is_active: true,
      created_date: '2025-01-01',
      sub_niches: ['cooking tutorials', 'recipe sharing', 'food reviews', 'restaurant vlogs', 'baking', 'meal prep', 'food challenges', 'nutrition', 'dietary content'],
      content_types: ['tutorial', 'review', 'vlog', 'challenge', 'educational', 'entertainment'],
      target_audience: ['home cooks', 'food enthusiasts', 'health conscious', 'beginners', 'experienced chefs'],
      engagement_patterns: ['high comment engagement', 'recipe requests', 'cooking questions', 'food recommendations'],
      viral_factors: ['unique recipes', 'food challenges', 'restaurant discoveries', 'cooking fails', 'amazing transformations'],
      competitive_landscape: ['established food channels', 'celebrity chefs', 'restaurant chains', 'food bloggers']
    },
    'gaming': {
      niche_type: 'gaming',
      description: 'A hub for gamers, including streaming, gameplay, and community activities.',
      ai_description: 'Analyze metadata (title, description, hashtags) for terms like "gameplay," "playthrough," "game review," "esports," "console," "PC gaming," "Twitch," or specific game titles. In transcripts/comments, look for discussions about game mechanics, strategies, character names, or gaming events.',
      keywords: ['gameplay', 'Rematch game', 'playthrough', 'gaming channel', 'game review', 'lets play', 'twitch', 'esports', 'video game', 'console', 'pc gaming', 'speedrun', 'gaming news', 'gaming setup'],
      label: 'Gaming',
      is_active: true,
      created_date: '2025-01-01',
      sub_niches: ['gameplay', 'reviews', 'esports', 'gaming news', 'tutorials', 'streaming', 'gaming setup', 'mobile gaming'],
      content_types: ['gameplay', 'review', 'news', 'tutorial', 'stream', 'highlight', 'commentary'],
      target_audience: ['gamers', 'esports fans', 'casual players', 'hardcore gamers', 'gaming enthusiasts'],
      engagement_patterns: ['high interaction during live streams', 'game discussion', 'strategy sharing', 'community building'],
      viral_factors: ['amazing plays', 'funny moments', 'game reveals', 'esports highlights', 'gaming fails'],
      competitive_landscape: ['major gaming channels', 'esports organizations', 'game developers', 'streaming platforms']
    },
    'fitness': {
      niche_type: 'fitness',
      description: 'Focused on health, workouts, and maintaining an active lifestyle.',
      ai_description: 'Analyze metadata (title, description, hashtags) for "workout," "exercise," "fitness," "gym," "strength training," "cardio," "yoga," "diet," "nutrition," or "bodybuilding." In transcripts/comments, identify discussions about workout routines, dietary plans, health goals, or fitness equipment.',
      keywords: ['workout', 'exercise', 'fitness', 'gym', 'healthy lifestyle', 'strength training', 'cardio', 'yoga', 'diet', 'nutrition', 'bodybuilding', 'personal trainer', 'home workout'],
      label: 'Fitness',
      is_active: true,
      created_date: '2025-01-01',
      sub_niches: ['workout routines', 'fitness tips', 'health advice', 'transformation', 'motivation', 'nutrition', 'yoga', 'cardio', 'strength training'],
      content_types: ['tutorial', 'motivation', 'challenge', 'transformation', 'educational', 'workout'],
      target_audience: ['fitness enthusiasts', 'beginners', 'athletes', 'health conscious', 'weight loss seekers'],
      engagement_patterns: ['workout completion', 'progress sharing', 'motivation requests', 'form questions'],
      viral_factors: ['amazing transformations', 'workout challenges', 'fitness motivation', 'health tips', 'exercise hacks'],
      competitive_landscape: ['fitness influencers', 'gym chains', 'health brands', 'personal trainers']
    },
    'technology': {
      niche_type: 'technology',
      description: 'Content about tech reviews, tutorials, news, and digital innovation.',
      ai_description: 'Search for technology terms, device names, software references, tech news, gadget reviews, programming content, digital trends, and tech tutorials. Look for tech-related hashtags, product reviews, and technology discussions.',
      keywords: ['technology', 'tech', 'review', 'gadget', 'app', 'software', 'programming', 'coding', 'tech news', 'gadget review', 'tech tutorial', 'digital', 'innovation', 'ai', 'artificial intelligence', 'tech tips'],
      label: 'Technology',
      is_active: true,
      created_date: '2025-01-01',
      sub_niches: ['tech reviews', 'programming', 'gadget reviews', 'tech news', 'tutorials', 'ai content', 'software reviews'],
      content_types: ['review', 'news', 'tutorial', 'comparison', 'unboxing', 'educational'],
      target_audience: ['tech enthusiasts', 'developers', 'early adopters', 'casual users', 'professionals'],
      engagement_patterns: ['technical discussions', 'product comparisons', 'tutorial requests', 'tech questions'],
      viral_factors: ['new product reveals', 'tech fails', 'amazing features', 'price drops', 'tech hacks'],
      competitive_landscape: ['tech reviewers', 'tech companies', 'news outlets', 'influencers']
    },
    'beauty': {
      niche_type: 'beauty',
      description: 'Content focused on makeup, skincare, beauty tips, and personal care.',
      ai_description: 'Analyze for beauty terminology, makeup products, skincare routines, beauty tips, cosmetic reviews, and personal care content. Look for beauty-related hashtags, makeup tutorials, skincare advice, and beauty product discussions.',
      keywords: ['makeup', 'skincare', 'beauty', 'cosmetics', 'tutorial', 'beauty tips', 'makeup tutorial', 'skincare routine', 'beauty review', 'cosmetic', 'beauty hack', 'makeup look', 'skincare tips'],
      label: 'Beauty',
      is_active: true,
      created_date: '2025-01-01',
      sub_niches: ['makeup tutorials', 'skincare routines', 'product reviews', 'beauty tips', 'makeup looks', 'skincare advice'],
      content_types: ['tutorial', 'review', 'transformation', 'tips', 'challenge', 'educational'],
      target_audience: ['beauty enthusiasts', 'makeup beginners', 'skincare focused', 'fashion conscious', 'self-care oriented'],
      engagement_patterns: ['product recommendations', 'routine sharing', 'transformation reactions', 'beauty questions'],
      viral_factors: ['amazing transformations', 'beauty hacks', 'product discoveries', 'makeup fails', 'skincare results'],
      competitive_landscape: ['beauty influencers', 'cosmetic brands', 'beauty retailers', 'makeup artists']
    },
    'education': {
      niche_type: 'education',
      description: 'Content dedicated to learning, tutorials, academic subjects, and skill development.',
      ai_description: 'Look for educational terms, subject matter, tutorial content, learning resources, academic topics, and skill-building content. Analyze for educational hashtags, tutorial content, and learning-focused discussions.',
      keywords: ['education', 'tutorial', 'learn', 'study', 'academic', 'course', 'lesson', 'teaching', 'learning', 'educational', 'knowledge', 'skill', 'training', 'how to', 'guide'],
      label: 'Education',
      is_active: true,
      created_date: '2025-01-01',
      sub_niches: ['academic subjects', 'skill tutorials', 'language learning', 'test prep', 'career advice', 'life skills'],
      content_types: ['tutorial', 'lecture', 'explanation', 'how-to', 'educational', 'course'],
      target_audience: ['students', 'professionals', 'lifelong learners', 'skill seekers', 'academic focused'],
      engagement_patterns: ['learning questions', 'clarification requests', 'study tips', 'progress sharing'],
      viral_factors: ['amazing explanations', 'study hacks', 'learning tips', 'academic success', 'skill demonstrations'],
      competitive_landscape: ['educational institutions', 'online courses', 'tutors', 'subject experts']
    },
    'entertainment': {
      niche_type: 'entertainment',
      description: 'Content focused on humor, comedy, entertainment, and fun content.',
      ai_description: 'Search for entertainment terms, comedy content, funny moments, entertainment news, celebrity content, and humorous discussions. Look for entertainment-related hashtags, comedy content, and fun-focused discussions.',
      keywords: ['entertainment', 'comedy', 'funny', 'humor', 'entertainment news', 'celebrity', 'fun', 'amusing', 'entertaining', 'comedy skit', 'funny video', 'entertainment gossip'],
      label: 'Entertainment',
      is_active: true,
      created_date: '2025-01-01',
      sub_niches: ['comedy skits', 'entertainment news', 'celebrity content', 'funny moments', 'entertainment gossip'],
      content_types: ['comedy', 'news', 'entertainment', 'funny', 'gossip', 'celebrity'],
      target_audience: ['entertainment fans', 'comedy lovers', 'celebrity followers', 'fun seekers', 'general audience'],
      engagement_patterns: ['humor reactions', 'entertainment discussions', 'celebrity gossip', 'funny comments'],
      viral_factors: ['funny moments', 'celebrity news', 'entertainment gossip', 'comedy skits', 'viral trends'],
      competitive_landscape: ['entertainment channels', 'celebrity channels', 'comedy creators', 'news outlets']
    },
    'lifestyle': {
      niche_type: 'lifestyle',
      description: 'Content about daily life, personal experiences, lifestyle tips, and life advice.',
      ai_description: 'Analyze for lifestyle terms, daily routines, personal experiences, life advice, and lifestyle content. Look for lifestyle-related hashtags, daily vlogs, and life-focused discussions.',
      keywords: ['lifestyle', 'daily', 'routine', 'life', 'personal', 'experience', 'lifestyle tips', 'daily routine', 'life advice', 'lifestyle vlog', 'personal story', 'life tips'],
      label: 'Lifestyle',
      is_active: true,
      created_date: '2025-01-01',
      sub_niches: ['daily routines', 'life advice', 'personal stories', 'lifestyle tips', 'life hacks', 'personal development'],
      content_types: ['vlog', 'advice', 'story', 'routine', 'lifestyle', 'personal'],
      target_audience: ['lifestyle enthusiasts', 'personal development seekers', 'routine followers', 'life advice seekers'],
      engagement_patterns: ['routine sharing', 'life advice requests', 'personal stories', 'lifestyle questions'],
      viral_factors: ['amazing routines', 'life hacks', 'personal transformations', 'lifestyle tips', 'daily inspiration'],
      competitive_landscape: ['lifestyle influencers', 'personal development coaches', 'life coaches', 'routine creators']
    },
    'travel': {
      niche_type: 'travel',
      description: 'Content about travel experiences, destinations, travel tips, and adventure.',
      ai_description: 'Look for travel terms, destination names, travel tips, adventure content, and travel experiences. Analyze for travel-related hashtags, destination content, and travel-focused discussions.',
      keywords: ['travel', 'destination', 'trip', 'vacation', 'adventure', 'travel tips', 'travel vlog', 'destination guide', 'travel experience', 'travel hack', 'travel advice'],
      label: 'Travel',
      is_active: true,
      created_date: '2025-01-01',
      sub_niches: ['travel vlogs', 'destination guides', 'travel tips', 'adventure content', 'travel reviews', 'budget travel'],
      content_types: ['vlog', 'guide', 'review', 'adventure', 'tips', 'travel'],
      target_audience: ['travelers', 'adventure seekers', 'vacation planners', 'travel enthusiasts', 'budget travelers'],
      engagement_patterns: ['destination questions', 'travel advice', 'trip planning', 'travel recommendations'],
      viral_factors: ['amazing destinations', 'travel hacks', 'adventure content', 'budget travel', 'hidden gems'],
      competitive_landscape: ['travel influencers', 'travel agencies', 'hotels', 'tourist boards']
    },
    'business': {
      niche_type: 'business',
      description: 'Content about entrepreneurship, business tips, career advice, and professional development.',
      ai_description: 'Search for business terms, entrepreneurship content, career advice, professional development, and business tips. Look for business-related hashtags, career content, and professional discussions.',
      keywords: ['business', 'entrepreneur', 'career', 'professional', 'business tips', 'entrepreneurship', 'career advice', 'business advice', 'professional development', 'business strategy'],
      label: 'Business',
      is_active: true,
      created_date: '2025-01-01',
      sub_niches: ['entrepreneurship', 'career advice', 'business tips', 'professional development', 'business strategy', 'startup content'],
      content_types: ['advice', 'tutorial', 'strategy', 'educational', 'business', 'career'],
      target_audience: ['entrepreneurs', 'professionals', 'career seekers', 'business owners', 'students'],
      engagement_patterns: ['business questions', 'career advice', 'strategy discussions', 'professional networking'],
      viral_factors: ['business success', 'career tips', 'entrepreneurial advice', 'business hacks', 'professional insights'],
      competitive_landscape: ['business coaches', 'consultants', 'entrepreneurs', 'career advisors']
    },
    'relationships': {
      niche_type: 'relationships',
      description: 'Content dedicated to love, dating advice, and building strong connections.',
      ai_description: 'Scan metadata (title, description, hashtags) for "dating," "relationship advice," "love," "breakup," "marriage," "couples," "friendship," or "family dynamics." In transcripts/comments, look for advice-seeking, personal anecdotes about relationships, discussions on communication, or emotional support.',
      keywords: ['dating', 'relationship advice', 'love', 'breakup', 'marriage', 'couples', 'friendship', 'family dynamics', 'healthy relationships', 'communication', 'romance', 'relationship tips'],
      label: 'Relationships',
      is_active: true,
      created_date: '2025-01-01',
      sub_niches: ['dating advice', 'relationship tips', 'marriage counseling', 'friendship', 'family dynamics'],
      content_types: ['advice', 'story', 'educational', 'discussion', 'support'],
      target_audience: ['dating seekers', 'couples', 'families', 'relationship focused'],
      engagement_patterns: ['advice seeking', 'personal sharing', 'relationship discussions'],
      viral_factors: ['relationship advice', 'love stories', 'dating tips', 'marriage insights'],
      competitive_landscape: ['relationship coaches', 'therapists', 'dating experts']
    },
    'educational': {
      niche_type: 'educational',
      description: 'Resources and tips for learning, teaching, and sharing knowledge.',
      ai_description: 'Look for metadata (title, description, hashtags) containing "learn," "education," "tutorial," "how to," "science," "math," "programming," "lecture," or "study tips." In transcripts/comments, detect questions, explanations, step-by-step instructions, or discussions confirming understanding of a topic.',
      keywords: ['learn', 'education', 'tutorial', 'how to', 'science', 'math', 'programming', 'lectures', 'knowledge', 'facts', 'skillshare', 'course', 'study tips'],
      label: 'Educational',
      is_active: true,
      created_date: '2025-01-01',
      sub_niches: ['academic subjects', 'skill tutorials', 'language learning', 'test prep', 'career advice'],
      content_types: ['tutorial', 'lecture', 'explanation', 'how-to', 'educational'],
      target_audience: ['students', 'professionals', 'lifelong learners', 'skill seekers'],
      engagement_patterns: ['learning questions', 'clarification requests', 'study tips'],
      viral_factors: ['amazing explanations', 'study hacks', 'learning tips'],
      competitive_landscape: ['educational institutions', 'online courses', 'tutors']
    },
    'reddit-stories': {
      niche_type: 'reddit-stories',
      description: 'A niche for sharing and discussing intriguing stories and confessions from Reddit.',
      ai_description: 'Prioritize metadata (title, description, hashtags) mentioning "reddit story," "story time," "AITA," "TIFU," "AskReddit," or specific subreddit names. In transcripts/comments, look for direct references to Reddit, common Reddit phrases, or discussions analyzing the moral or humorous aspects of submitted stories.',
      keywords: ['reddit story', 'story time', 'aita', 'relationship_advice', 'tifu', 'askreddit', 'reddit stories', 'subreddit', 'true stories', 'reddit confessions'],
      label: 'Reddit Stories',
      is_active: true,
      created_date: '2025-01-01',
      sub_niches: ['AITA stories', 'TIFU stories', 'AskReddit', 'relationship advice', 'confessions'],
      content_types: ['story', 'discussion', 'reaction', 'analysis'],
      target_audience: ['story lovers', 'reddit users', 'drama enthusiasts'],
      engagement_patterns: ['story reactions', 'moral discussions', 'reddit references'],
      viral_factors: ['dramatic stories', 'funny confessions', 'moral dilemmas'],
      competitive_landscape: ['story channels', 'reddit content creators']
    },
    'basketball': {
      niche_type: 'basketball',
      description: 'All about basketball, including gameplay, lifestyle, and fan culture.',
      ai_description: 'Scan metadata (title, description, hashtags) for "NBA," "basketball," "hoops," "game highlights," "dunk," "layup," or team/player names (e.g., "LeBron," "Lakers"). In transcripts/comments, identify discussions about game plays, player performance, team strategies, or league news.',
      keywords: ['nba', 'basketball', 'hoops', 'court', 'game highlights', 'dunk', 'layup', 'basketball training', 'basketball moves', 'nba playoffs', 'college basketball', 'streetball'],
      label: 'Basketball',
      is_active: true,
      created_date: '2025-01-01',
      sub_niches: ['NBA highlights', 'college basketball', 'streetball', 'basketball training', 'player analysis'],
      content_types: ['highlights', 'analysis', 'training', 'news', 'reaction'],
      target_audience: ['basketball fans', 'NBA followers', 'sports enthusiasts'],
      engagement_patterns: ['game discussions', 'player debates', 'highlight reactions'],
      viral_factors: ['amazing dunks', 'game winners', 'player highlights'],
      competitive_landscape: ['sports channels', 'NBA media', 'basketball analysts']
    },
    'finance': {
      niche_type: 'finance',
      description: 'Insights and strategies for wealth building, investments, and financial freedom.',
      ai_description: 'Look for metadata (title, description, hashtags) mentioning "money," "investing," "stocks," "financial advice," "budgeting," "personal finance," "economy," or "retirement." In transcripts/comments, detect discussions on financial planning, market trends, investment tips, saving strategies, or economic news.',
      keywords: ['money', 'investing', 'stocks', 'financial advice', 'budgeting', 'personal finance', 'economy', 'saving money', 'retirement', 'forex', 'market analysis', 'financial freedom', 'stock market', 'investing tips'],
      label: 'Finance',
      is_active: true,
      created_date: '2025-01-01',
      sub_niches: ['investing', 'personal finance', 'stock market', 'budgeting', 'financial planning'],
      content_types: ['advice', 'analysis', 'tutorial', 'news', 'educational'],
      target_audience: ['investors', 'budget conscious', 'financial learners'],
      engagement_patterns: ['investment discussions', 'financial questions', 'market analysis'],
      viral_factors: ['investment tips', 'financial hacks', 'market predictions'],
      competitive_landscape: ['financial advisors', 'investment channels', 'finance experts']
    },
    'crypto': {
      niche_type: 'crypto',
      description: 'Focused on cryptocurrency, blockchain technology, and decentralized finance trends.',
      ai_description: 'Examine metadata (title, description, hashtags) for "cryptocurrency," "Bitcoin," "blockchain," "trading," "Ethereum," "NFT," "DeFi," or specific altcoin names. In transcripts/comments, identify discussions about market analysis, trading strategies, blockchain technology, digital assets, or specific crypto projects.',
      keywords: ['cryptocurrency', 'bitcoin', 'blockchain', 'trading', 'shitcoin', 'ethereum', 'altcoin', 'nft', 'defi', 'crypto news', 'crypto analysis', 'web3', 'mining'],
      label: 'Crypto',
      is_active: true,
      created_date: '2025-01-01',
      sub_niches: ['Bitcoin', 'Ethereum', 'NFTs', 'DeFi', 'trading', 'blockchain'],
      content_types: ['analysis', 'news', 'tutorial', 'trading', 'educational'],
      target_audience: ['crypto investors', 'traders', 'blockchain enthusiasts'],
      engagement_patterns: ['market discussions', 'trading strategies', 'crypto news'],
      viral_factors: ['price predictions', 'trading tips', 'crypto news'],
      competitive_landscape: ['crypto influencers', 'trading channels', 'blockchain experts']
    }
  };

  constructor(
    @InjectModel('VideoAnalytics') private videoModel: Model<VideoAnalytics>,
    private readonly configService: ConfigService,
    private readonly openaiService: OpenAIService,
  ) {}

  /**
   * Classify content into niches using AI and real YouTube data
   */
  async classifyContent(videoData: any, userId?: string): Promise<NicheClassificationResult> {
    try {
      this.logger.log(`Starting niche classification for video: ${videoData.videoId}`);

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

      // Perform AI-powered niche classification
      const classifications = await this.performAINicheClassification(enrichedVideoData);

      // Determine primary niche
      const primaryNiche = this.determinePrimaryNiche(classifications);
      const confidence = this.calculateOverallConfidence(classifications);

      // Generate AI insights
      const [aiSummary, recommendations, marketOpportunity, contentStrategy] = await this.generateNicheInsights(
        enrichedVideoData,
        classifications,
        primaryNiche
      );

      return {
        videoId: enrichedVideoData.videoId,
        title: enrichedVideoData.title,
        classifications,
        primaryNiche,
        confidence,
        aiSummary,
        recommendations,
        marketOpportunity,
        contentStrategy,
      };
    } catch (error) {
      this.logger.error('Error in niche classification:', error);
      throw error;
    }
  }

  /**
   * Get real YouTube API data for a video (simplified version)
   */
  private async getYouTubeVideoData(videoId: string, userId: string): Promise<any> {
    try {
      // For now, return empty object to avoid circular dependency
      // The service will work with the data it receives from the caller
      this.logger.debug(`YouTube API data request for video ${videoId} - using provided data`);
      return {};
    } catch (error) {
      this.logger.warn(`Failed to get YouTube API data: ${error.message}`);
      return {};
    }
  }

  /**
   * Get video comments for analysis
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
   * Perform AI-powered niche classification
   */
  private async performAINicheClassification(videoData: any): Promise<ContentAnalysisResult[]> {
    try {
      const text = `${videoData.title} ${videoData.description} ${videoData.transcript || ''}`;
      const comments = videoData.comments?.map((c: any) => c.text).join(' ') || '';

      const prompt = `
        Analyze this YouTube video content and classify it into the most relevant niches:

        Title: ${videoData.title}
        Description: ${videoData.description}
        Transcript: ${videoData.transcript || 'Not available'}
        Comments: ${comments}

        Available niches: ${Object.keys(this.NICHE_DEFINITIONS).join(', ')}

        For each relevant niche, provide:
        1. Confidence score (0-1)
        2. Detected topics
        3. Content intent
        4. Target audience type
        5. Engagement patterns
        6. Recommendations
        7. AI insights
        8. Sub-niche (if applicable)
        9. Content type
        10. Viral potential (0-100)
        11. Competitive advantages
        12. Content gaps

        IMPORTANT: Return ONLY a valid JSON array. Do not include any explanatory text, markdown formatting, or code blocks. Just the raw JSON array.

        Example format:
        [{"niche":"food+drink","confidence":0.92,"detectedTopics":["Recipe/Cooking"],"contentIntent":["Educational"],"audienceType":"Home cooks","engagementPatterns":["Recipe requests","Cooking questions"],"recommendations":["Add step-by-step instructions","Include ingredient substitutions"],"aiInsights":"This content effectively targets cooking enthusiasts with clear educational value","subNiche":"cooking tutorials","contentType":"tutorial","targetAudience":"beginner cooks","viralPotential":85,"competitiveAdvantage":["Clear instructions","Unique recipe"],"contentGaps":["Missing nutritional information"]}]
      `;

      const response = await this.openaiService.generatePostIdea({ prompt });

      try {
        // Clean the response to extract JSON
        let cleanedResponse = response.trim();

        // Remove any markdown code blocks
        cleanedResponse = cleanedResponse.replace(/```json\s*/g, '').replace(/```\s*/g, '');

        // Try to find JSON array in the response
        const jsonMatch = cleanedResponse.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          cleanedResponse = jsonMatch[0];
        }

        const parsed = JSON.parse(cleanedResponse);

        // Validate the parsed result
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        } else {
          throw new Error('Invalid response format');
        }
      } catch (parseError) {
        this.logger.warn(`Failed to parse AI niche classification: ${parseError.message}, using fallback`);
        return this.fallbackNicheClassification(videoData);
      }
    } catch (error) {
      this.logger.warn(`AI niche classification failed: ${error.message}`);
      return this.fallbackNicheClassification(videoData);
    }
  }

  /**
   * Determine primary niche from classifications
   */
  private determinePrimaryNiche(classifications: ContentAnalysisResult[]): string {
    if (classifications.length === 0) return 'general';

    // Sort by confidence and return the highest
    const sorted = classifications.sort((a, b) => b.confidence - a.confidence);
    return sorted[0].niche;
  }

  /**
   * Calculate overall confidence score
   */
  private calculateOverallConfidence(classifications: ContentAnalysisResult[]): number {
    if (classifications.length === 0) return 0;

    const totalConfidence = classifications.reduce((sum, c) => sum + c.confidence, 0);
    return totalConfidence / classifications.length;
  }

  /**
   * Generate niche-specific insights using AI
   */
  private async generateNicheInsights(
    videoData: any,
    classifications: ContentAnalysisResult[],
    primaryNiche: string
  ): Promise<[string, string[], string, string]> {
    try {
      const nicheDefinition = this.NICHE_DEFINITIONS[primaryNiche];

      const prompt = `
        Generate comprehensive niche insights for this YouTube video:

        Video: ${videoData.title}
        Primary Niche: ${primaryNiche}
        Niche Description: ${nicheDefinition?.description || 'Not available'}

        Classifications: ${JSON.stringify(classifications)}

        Provide:
        1. Executive summary (2-3 sentences)
        2. Top 5 actionable recommendations
        3. Market opportunity analysis
        4. Content strategy suggestions

        IMPORTANT: Return ONLY a valid JSON object. Do not include any explanatory text, markdown formatting, or code blocks. Just the raw JSON.

        Example format:
        {"summary":"This content effectively targets the ${primaryNiche} niche with strong potential...","recommendations":["Optimize title for niche keywords","Add niche-specific hashtags","Collaborate with niche creators","Create series content","Engage with niche community"],"marketOpportunity":"Growing demand in ${primaryNiche} with low competition in specific sub-niche","contentStrategy":"Focus on educational content with regular uploads and community engagement"}
      `;

      const response = await this.openaiService.generatePostIdea({ prompt });

      try {
        // Clean the response to extract JSON
        let cleanedResponse = response.trim();

        // Remove any markdown code blocks
        cleanedResponse = cleanedResponse.replace(/```json\s*/g, '').replace(/```\s*/g, '');

        // Try to find JSON object in the response
        const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          cleanedResponse = jsonMatch[0];
        }

        const parsed = JSON.parse(cleanedResponse);

        // Validate the parsed result
        if (parsed.summary && parsed.recommendations && parsed.marketOpportunity && parsed.contentStrategy) {
          return [parsed.summary, parsed.recommendations, parsed.marketOpportunity, parsed.contentStrategy];
        } else {
          throw new Error('Invalid response format');
        }
      } catch (parseError) {
        this.logger.warn(`Failed to parse AI insights: ${parseError.message}, using fallback`);
        return this.fallbackNicheInsights(videoData, primaryNiche);
      }
    } catch (error) {
      this.logger.warn(`AI insights generation failed: ${error.message}`);
      return this.fallbackNicheInsights(videoData, primaryNiche);
    }
  }

  /**
   * Get all available niches
   */
  async getAvailableNiches(): Promise<NicheDefinition[]> {
    return Object.values(this.NICHE_DEFINITIONS).filter(niche => niche.is_active);
  }

  /**
   * Get specific niche definition
   */
  async getNicheDefinition(nicheType: string): Promise<NicheDefinition | null> {
    return this.NICHE_DEFINITIONS[nicheType] || null;
  }

  /**
   * Calculate niche confidence score
   */
  private calculateNicheConfidence(videoData: any, niche: string): number {
    const nicheDefinition = this.NICHE_DEFINITIONS[niche];
    if (!nicheDefinition) return 0;

    const text = `${videoData.title} ${videoData.description}`.toLowerCase();
    const keywords = nicheDefinition.keywords.map(k => k.toLowerCase());

    let matches = 0;
    keywords.forEach(keyword => {
      if (text.includes(keyword)) {
        matches++;
      }
    });

    return Math.min(1, matches / keywords.length);
  }

  /**
   * Analyze content for specific niche
   */
  private analyzeContentForNiche(videoData: any, niche: string): Partial<ContentAnalysisResult> {
    const nicheDefinition = this.NICHE_DEFINITIONS[niche];
    if (!nicheDefinition) return {};

    const text = `${videoData.title} ${videoData.description}`.toLowerCase();

    // Detect topics
    const detectedTopics = this.detectTopics(text, niche);

    // Analyze content intent
    const contentIntent = this.analyzeContentIntent(text, niche);

    // Determine audience type
    const audienceType = this.determineAudienceType(text, niche);

    // Analyze engagement patterns
    const engagementPatterns = this.analyzeEngagementPatterns(videoData, niche);

    // Generate recommendations
    const recommendations = this.generateRecommendations(videoData, niche);

    return {
      detectedTopics,
      contentIntent,
      audienceType,
      engagementPatterns,
      recommendations,
    };
  }

  /**
   * Detect topics from content
   */
  private detectTopics(text: string, niche: string): string[] {
    const topics: string[] = [];

    // Add niche-specific topic detection logic here
    if (niche === 'food+drink') {
      if (text.includes('recipe') || text.includes('cook')) topics.push('Recipe/Cooking');
      if (text.includes('review') || text.includes('taste')) topics.push('Food Review');
      if (text.includes('restaurant') || text.includes('dining')) topics.push('Restaurant');
    } else if (niche === 'gaming') {
      if (text.includes('gameplay') || text.includes('play')) topics.push('Gameplay');
      if (text.includes('review') || text.includes('opinion')) topics.push('Game Review');
      if (text.includes('esports') || text.includes('competitive')) topics.push('Esports');
    }

    return topics;
  }

  /**
   * Analyze content intent
   */
  private analyzeContentIntent(text: string, niche: string): string[] {
    const intent: string[] = [];

    if (text.includes('how to') || text.includes('tutorial')) intent.push('Educational');
    if (text.includes('review') || text.includes('opinion')) intent.push('Review');
    if (text.includes('funny') || text.includes('comedy')) intent.push('Entertainment');
    if (text.includes('challenge') || text.includes('experiment')) intent.push('Challenge');

    return intent;
  }

  /**
   * Determine audience type
   */
  private determineAudienceType(text: string, niche: string): string {
    if (text.includes('beginner') || text.includes('new')) return 'Beginners';
    if (text.includes('advanced') || text.includes('expert')) return 'Advanced';
    return 'General';
  }

  /**
   * Analyze engagement patterns
   */
  private analyzeEngagementPatterns(videoData: any, niche: string): string[] {
    const patterns: string[] = [];

    const engagementRate = this.calculateEngagementRate(videoData);
    if (engagementRate > 5) patterns.push('High Engagement');
    if (engagementRate > 2) patterns.push('Moderate Engagement');

    return patterns;
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(videoData: any, niche: string): string[] {
    const recommendations: string[] = [];

    // Add niche-specific recommendations
    if (niche === 'food+drink') {
      recommendations.push('Add step-by-step cooking instructions');
      recommendations.push('Include ingredient substitutions');
      recommendations.push('Show cooking tips and tricks');
    } else if (niche === 'gaming') {
      recommendations.push('Add gameplay commentary');
      recommendations.push('Include gaming tips and strategies');
      recommendations.push('Show gaming setup and equipment');
    }

    return recommendations;
  }

  /**
   * Get authenticated YouTube client
   */
  private async getAuthenticatedYoutube(userId?: string) {
    try {
      // Use API key for public data (simplified to avoid circular dependency)
      const apiKey = this.configService.get<string>('YOUTUBE_API_KEY');
      if (!apiKey) {
        throw new Error('YouTube API key not configured');
      }
      return google.youtube({ version: 'v3', auth: apiKey });
    } catch (error) {
      this.logger.error('Failed to get authenticated YouTube:', error);
      throw error;
    }
  }

  /**
   * Calculate engagement rate
   */
  private calculateEngagementRate(videoData: any): number {
    const views = videoData.viewCount || 1;
    const likes = videoData.likeCount || 0;
    const comments = videoData.commentCount || 0;
    return ((likes + comments) / views) * 100;
  }

  // Fallback methods for when AI fails
  private fallbackNicheClassification(videoData: any): ContentAnalysisResult[] {
    const text = `${videoData.title} ${videoData.description}`.toLowerCase();
    const results: ContentAnalysisResult[] = [];

    // Check each niche
    Object.entries(this.NICHE_DEFINITIONS).forEach(([nicheKey, nicheDef]) => {
      const confidence = this.calculateNicheConfidence(videoData, nicheKey);

      if (confidence > 0.3) {
        const analysis = this.analyzeContentForNiche(videoData, nicheKey);
        results.push({
          niche: nicheKey,
          confidence,
          detectedTopics: analysis.detectedTopics || [],
          contentIntent: analysis.contentIntent || [],
          audienceType: analysis.audienceType || 'General',
          engagementPatterns: analysis.engagementPatterns || [],
          recommendations: analysis.recommendations || [],
          aiInsights: `Content shows ${confidence * 100}% relevance to ${nicheDef.label} niche`,
          subNiche: analysis.subNiche,
          contentType: analysis.contentType,
          targetAudience: analysis.targetAudience,
          viralPotential: analysis.viralPotential,
          competitiveAdvantage: analysis.competitiveAdvantage,
          contentGaps: analysis.contentGaps,
        });
      }
    });

    return results.sort((a, b) => b.confidence - a.confidence);
  }

  private fallbackNicheInsights(videoData: any, primaryNiche: string): [string, string[], string, string] {
    const nicheDefinition = this.NICHE_DEFINITIONS[primaryNiche];

    return [
      `Content analysis completed for ${primaryNiche} niche with standard recommendations.`,
      [
        'Optimize title for niche keywords',
        'Add niche-specific hashtags',
        'Engage with niche community',
        'Create consistent content',
        'Monitor niche trends',
      ],
      `Growing opportunity in ${primaryNiche} with moderate competition`,
      `Focus on educational content with regular uploads and community engagement`,
    ];
  }
}
