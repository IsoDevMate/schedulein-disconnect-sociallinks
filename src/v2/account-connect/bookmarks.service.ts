import { Injectable, Logger, NotFoundException, BadRequestException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { Bookmark, BookmarkType } from "./schemas/bookmark.schema";
import {
  CreateBookmarkDto,
  UpdateBookmarkDto,
  BookmarkResponseDto,
  GenerateIdeasFromBookmarksDto,
  IdeaGenerationResponseDto,
} from "./dto/account-connect.dto";
import { OpenAIService } from "../../openai/openai.service";
import axios from "axios";

@Injectable()
export class BookmarksService {
  private readonly logger = new Logger(BookmarksService.name);

  constructor(
    @InjectModel(Bookmark.name) private bookmarkModel: Model<Bookmark>,
    private readonly openAIService: OpenAIService,
  ) {}

  async createBookmark(
    userId: string,
    collectionId: string,
    dto: CreateBookmarkDto,
  ): Promise<BookmarkResponseDto> {
    try {
      this.logger.debug(`Creating bookmark for user ${userId} in collection ${collectionId}: ${dto.title}`);

      // If it's a video type, fetch metadata from the URL
      let scrapedTitle = dto.title;
      let scrapedThumbnailUrl = dto.thumbnailUrl;
      let platformContentId = dto.platformContentId;

      if (dto.type === BookmarkType.VIDEO && dto.url) {
        const metadata = await this.fetchVideoMetadata(dto.url, dto.platform);
        scrapedTitle = metadata.title || dto.title;
        scrapedThumbnailUrl = metadata.thumbnailUrl || dto.thumbnailUrl;
        platformContentId = metadata.contentId || dto.platformContentId;
      }

      const bookmark = new this.bookmarkModel({
        userId: new Types.ObjectId(userId),
        collectionId: new Types.ObjectId(collectionId),
        type: dto.type,
        title: scrapedTitle,
        description: dto.description,
        url: dto.url,
        thumbnailUrl: scrapedThumbnailUrl,
        platform: dto.platform,
        platformContentId,
        creatorUsername: dto.creatorUsername,
        creatorDisplayName: dto.creatorDisplayName,
        tags: dto.tags || [],
        notes: dto.notes || [],
        metadata: {
          duration: 0,
          views: 0,
          likes: 0,
          comments: 0,
          shares: 0,
          hashtags: [],
          description: dto.description,
          publishedAt: new Date(),
        },
        isFavorite: false,
        isProcessed: false,

      });

      const savedBookmark = await bookmark.save();
      return this.mapToResponseDto(savedBookmark);
    } catch (error) {
      this.logger.error(`Failed to create bookmark: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getBookmarks(
    userId: string,
    filters: {
      type?: BookmarkType;
      platform?: string;
      isFavorite?: boolean;
      search?: string;
    } = {},
  ): Promise<BookmarkResponseDto[]> {
    try {
      const query: any = { userId: new Types.ObjectId(userId) };

      if (filters.type) query.type = filters.type;
      if (filters.platform) query.platform = filters.platform;
      if (filters.isFavorite !== undefined) query.isFavorite = filters.isFavorite;
      if (filters.search) {
        query.$or = [
          { title: { $regex: filters.search, $options: 'i' } },
          { description: { $regex: filters.search, $options: 'i' } },
          { tags: { $in: [new RegExp(filters.search, 'i')] } },
        ];
      }

      const bookmarks = await this.bookmarkModel
        .find(query)
        .sort({ createdAt: -1 })
        .lean();

      return bookmarks.map(bookmark => this.mapToResponseDto(bookmark));
    } catch (error) {
      this.logger.error(`Failed to get bookmarks: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getBookmarkById(
    userId: string,
    bookmarkId: string,
  ): Promise<BookmarkResponseDto> {
    try {
      // Validate bookmarkId format
      if (!bookmarkId || !Types.ObjectId.isValid(bookmarkId)) {
        throw new BadRequestException('Invalid bookmark ID format');
      }

      const bookmark = await this.bookmarkModel.findOne({
        _id: new Types.ObjectId(bookmarkId),
        userId: new Types.ObjectId(userId),
      }).lean();

      if (!bookmark) {
        throw new NotFoundException('Bookmark not found');
      }

      return this.mapToResponseDto(bookmark);
    } catch (error) {
      this.logger.error(`Failed to get bookmark: ${error.message}`, error.stack);
      throw error;
    }
  }

  async updateBookmark(
    userId: string,
    bookmarkId: string,
    dto: UpdateBookmarkDto,
  ): Promise<BookmarkResponseDto> {
    try {
      // Validate bookmarkId format
      if (!bookmarkId || !Types.ObjectId.isValid(bookmarkId)) {
        throw new BadRequestException('Invalid bookmark ID format');
      }

      const bookmark = await this.bookmarkModel.findOneAndUpdate(
        {
          _id: new Types.ObjectId(bookmarkId),
          userId: new Types.ObjectId(userId),
        },
        {
          $set: {
            ...(dto.title && { title: dto.title }),
            ...(dto.description && { description: dto.description }),
            ...(dto.tags && { tags: dto.tags }),
            ...(dto.isFavorite !== undefined && { isFavorite: dto.isFavorite }),
          },
        },
        { new: true },
      );

      if (!bookmark) {
        throw new NotFoundException('Bookmark not found');
      }

      return this.mapToResponseDto(bookmark);
    } catch (error) {
      this.logger.error(`Failed to update bookmark: ${error.message}`, error.stack);
      throw error;
    }
  }

  async deleteBookmark(userId: string, bookmarkId: string): Promise<void> {
    try {
      // Validate bookmarkId format
      if (!bookmarkId || !Types.ObjectId.isValid(bookmarkId)) {
        throw new BadRequestException('Invalid bookmark ID format');
      }

      const result = await this.bookmarkModel.deleteOne({
        _id: new Types.ObjectId(bookmarkId),
        userId: new Types.ObjectId(userId),
      });

      if (result.deletedCount === 0) {
        throw new NotFoundException('Bookmark not found');
      }
    } catch (error) {
      this.logger.error(`Failed to delete bookmark: ${error.message}`, error.stack);
      throw error;
    }
  }

  async toggleFavorite(userId: string, bookmarkId: string): Promise<BookmarkResponseDto> {
    try {
      // Validate bookmarkId format
      if (!bookmarkId || !Types.ObjectId.isValid(bookmarkId)) {
        throw new BadRequestException('Invalid bookmark ID format');
      }

      const bookmark = await this.bookmarkModel.findOne({
        _id: new Types.ObjectId(bookmarkId),
        userId: new Types.ObjectId(userId),
      });

      if (!bookmark) {
        throw new NotFoundException('Bookmark not found');
      }

      bookmark.isFavorite = !bookmark.isFavorite;
      const updatedBookmark = await bookmark.save();

      return this.mapToResponseDto(updatedBookmark);
    } catch (error) {
      this.logger.error(`Failed to toggle favorite: ${error.message}`, error.stack);
      throw error;
    }
  }

  async addNote(
    userId: string,
    bookmarkId: string,
    note: string,
  ): Promise<BookmarkResponseDto> {
    try {
      const bookmark = await this.bookmarkModel.findOne({
        _id: new Types.ObjectId(bookmarkId),
        userId: new Types.ObjectId(userId),
      });

      if (!bookmark) {
        throw new NotFoundException('Bookmark not found');
      }

      bookmark.notes.push(note);
      const updatedBookmark = await bookmark.save();

      return this.mapToResponseDto(updatedBookmark);
    } catch (error) {
      this.logger.error(`Failed to add note: ${error.message}`, error.stack);
      throw error;
    }
  }

  async searchBookmarks(
    userId: string,
    query: string,
  ): Promise<BookmarkResponseDto[]> {
    try {
      const bookmarks = await this.bookmarkModel.find({
        userId: new Types.ObjectId(userId),
        $or: [
          { title: { $regex: query, $options: 'i' } },
          { description: { $regex: query, $options: 'i' } },
          { tags: { $in: [new RegExp(query, 'i')] } },
          { notes: { $in: [new RegExp(query, 'i')] } },
        ],
      }).sort({ createdAt: -1 }).lean();

      return bookmarks.map(bookmark => this.mapToResponseDto(bookmark));
    } catch (error) {
      this.logger.error(`Failed to search bookmarks: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getBookmarksByType(userId: string, collectionId: string, type: BookmarkType): Promise<BookmarkResponseDto[]> {
    try {
      const bookmarks = await this.bookmarkModel
        .find({
          userId: new Types.ObjectId(userId),
          collectionId: new Types.ObjectId(collectionId),
          type: type
        })
        .sort({ createdAt: -1 })
        .lean();

      return bookmarks.map(bookmark => this.mapToResponseDto(bookmark));
    } catch (error) {
      this.logger.error(`Failed to get bookmarks by type: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getBookmarksByTypeAcrossCollections(userId: string, type: BookmarkType): Promise<BookmarkResponseDto[]> {
    try {
      const bookmarks = await this.bookmarkModel
        .find({
          userId: new Types.ObjectId(userId),
          type: type
        })
        .sort({ createdAt: -1 })
        .lean();

      return bookmarks.map(bookmark => this.mapToResponseDto(bookmark));
    } catch (error) {
      this.logger.error(`Failed to get bookmarks by type across collections: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getAllBookmarks(userId: string, collectionId: string): Promise<any> {
    try {
      const [videos, ideas, scripts] = await Promise.all([
        this.getBookmarksByType(userId, collectionId, BookmarkType.VIDEO),
        this.getBookmarksByType(userId, collectionId, BookmarkType.IDEA),
        this.getBookmarksByType(userId, collectionId, BookmarkType.SCRIPT)
      ]);

      return {
        videos,
        ideas,
        scripts,
        totalCount: videos.length + ideas.length + scripts.length
      };
    } catch (error) {
      this.logger.error(`Failed to get all bookmarks: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getAllBookmarksAcrossCollections(userId: string): Promise<any> {
    try {
      const [videos, ideas, scripts] = await Promise.all([
        this.getBookmarksByTypeAcrossCollections(userId, BookmarkType.VIDEO),
        this.getBookmarksByTypeAcrossCollections(userId, BookmarkType.IDEA),
        this.getBookmarksByTypeAcrossCollections(userId, BookmarkType.SCRIPT)
      ]);

      return {
        videos,
        ideas,
        scripts,
        totalCount: videos.length + ideas.length + scripts.length
      };
    } catch (error) {
      this.logger.error(`Failed to get all bookmarks across collections: ${error.message}`, error.stack);
      throw error;
    }
  }

  async generateIdeasFromBookmarks(
    userId: string,
    dto: GenerateIdeasFromBookmarksDto,
  ): Promise<IdeaGenerationResponseDto[]> {
    try {
      this.logger.debug(`Generating ideas from bookmarks for user ${userId}`);

      // Get bookmarks to analyze
      const bookmarks = await this.getBookmarksForIdeaGeneration(userId, dto);

      if (bookmarks.length === 0) {
        throw new BadRequestException('No bookmarks found to generate ideas from');
      }

      // Analyze bookmarks and extract patterns
      const analysis = await this.analyzeBookmarksForIdeas(bookmarks);

      // Generate ideas using AI
      const ideas = await this.generateIdeasWithAI(analysis, dto.numberOfIdeas || 5);

      // Convert to response DTOs
      return ideas.map((idea, index) => ({
        id: `generated-${Date.now()}-${index}`,
        title: idea.title,
        description: idea.description,
        keyElements: idea.keyElements,
        hashtags: idea.hashtags,
        estimatedEngagement: idea.estimatedEngagement,
        targetAudience: idea.targetAudience,
        platform: idea.platform,
        createdAt: new Date(),
      }));
    } catch (error) {
      this.logger.error(`Failed to generate ideas: ${error.message}`, error.stack);
      throw error;
    }
  }

  async analyzeBookmarkContent(
    userId: string,
    bookmarkId: string,
  ): Promise<any> {
    try {
      const bookmark = await this.bookmarkModel.findOne({
        _id: new Types.ObjectId(bookmarkId),
        userId: new Types.ObjectId(userId),
      });

      if (!bookmark) {
        throw new NotFoundException('Bookmark not found');
      }

      // This would integrate with AI service for content analysis
      // For now, return basic analysis
      const analysis = {
        contentType: this.detectContentType(bookmark.title, bookmark.description),
        style: this.detectStyle(bookmark.metadata),
        mood: this.detectMood(bookmark.title, bookmark.description),
        targetAudience: this.detectTargetAudience(bookmark.metadata),
        keyElements: this.extractKeyElements(bookmark.title, bookmark.description),
        potentialIdeas: this.generatePotentialIdeas(bookmark),
        analyzedAt: new Date(),
      };

      // Update bookmark with analysis
      bookmark.aiAnalysis = analysis;
      bookmark.isProcessed = true;
      await bookmark.save();

      return analysis;
    } catch (error) {
      this.logger.error(`Failed to analyze bookmark: ${error.message}`, error.stack);
      throw error;
    }
  }

  private async fetchVideoMetadata(url: string, platform: string): Promise<any> {
    try {
      if (platform === 'youtube') {
        return await this.fetchYouTubeMetadata(url);
      } else if (platform === 'tiktok') {
        return await this.fetchTikTokMetadata(url);
      }
      return {};
    } catch (error) {
      this.logger.warn(`Failed to fetch video metadata: ${error.message}`);
      return {};
    }
  }

  private async fetchYouTubeMetadata(url: string): Promise<any> {
    try {
      const videoId = this.extractYouTubeVideoId(url);
      if (!videoId) return {};

      // Use YouTube Data API to fetch video details
      const response = await axios.get(
        `https://www.googleapis.com/youtube/v3/videos?id=${videoId}&part=snippet,statistics`,
        {
          params: {
            key: process.env.YOUTUBE_API_KEY,
          },
        },
      );

      if (response.data.items && response.data.items.length > 0) {
        const video = response.data.items[0];
        return {
          title: video.snippet.title,
          thumbnailUrl: video.snippet.thumbnails?.high?.url,
          contentId: videoId,
        };
      }
      return {};
    } catch (error) {
      this.logger.warn(`Failed to fetch YouTube metadata: ${error.message}`);
      return {};
    }
  }

  private async fetchTikTokMetadata(url: string): Promise<any> {
    try {
      // TikTok doesn't have a public API for video metadata
      // We can extract basic info from the URL
      const videoId = this.extractTikTokVideoId(url);
      if (!videoId) return {};

      return {
        title: 'TikTok Video',
        thumbnailUrl: null,
        contentId: videoId,
      };
    } catch (error) {
      this.logger.warn(`Failed to fetch TikTok metadata: ${error.message}`);
      return {};
    }
  }

  private extractYouTubeVideoId(url: string): string | null {
    const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/);
    return match ? match[1] : null;
  }

  private extractTikTokVideoId(url: string): string | null {
    const match = url.match(/tiktok\.com\/@[^\/]+\/video\/(\d+)/);
    return match ? match[1] : null;
  }

  private mapToResponseDto(bookmark: any): BookmarkResponseDto {
    return {
      id: bookmark._id.toString(),
      collectionId: bookmark.collectionId?.toString() || '',
      type: bookmark.type,
      title: bookmark.title,
      description: bookmark.description,
      url: bookmark.url,
      thumbnailUrl: bookmark.thumbnailUrl,
      platform: bookmark.platform,
      platformContentId: bookmark.platformContentId,
      creatorUsername: bookmark.creatorUsername,
      creatorDisplayName: bookmark.creatorDisplayName,
      tags: bookmark.tags || [],
      notes: bookmark.notes || [],
      isFavorite: bookmark.isFavorite,
      metadata: bookmark.metadata,
      aiAnalysis: bookmark.aiAnalysis,
      createdAt: bookmark.createdAt,
      updatedAt: bookmark.updatedAt,
    };
  }

  // Helper methods for content analysis
  private detectContentType(title: string, description: string): string {
    const text = `${title} ${description}`.toLowerCase();
    if (text.includes('tutorial') || text.includes('how to')) return 'tutorial';
    if (text.includes('review') || text.includes('test')) return 'review';
    if (text.includes('vlog') || text.includes('day')) return 'vlog';
    if (text.includes('comedy') || text.includes('funny')) return 'comedy';
    return 'general';
  }

  private detectStyle(metadata: any): string {
    if (!metadata) return 'unknown';
    const views = metadata.views || 0;
    const likes = metadata.likes || 0;
    const engagement = views > 0 ? (likes / views) * 100 : 0;

    if (engagement > 10) return 'high_engagement';
    if (engagement > 5) return 'medium_engagement';
    return 'low_engagement';
  }

  private detectMood(title: string, description: string): string {
    const text = `${title} ${description}`.toLowerCase();
    if (text.includes('happy') || text.includes('joy')) return 'happy';
    if (text.includes('sad') || text.includes('depressing')) return 'sad';
    if (text.includes('angry') || text.includes('frustrated')) return 'angry';
    if (text.includes('calm') || text.includes('peaceful')) return 'calm';
    return 'neutral';
  }

  private detectTargetAudience(metadata: any): string {
    // This would be more sophisticated in a real implementation
    return 'general';
  }

  private extractKeyElements(title: string, description: string): string[] {
    const text = `${title} ${description}`;
    const words = text.toLowerCase().match(/\b\w+\b/g) || [];
    const wordCount: { [key: string]: number } = {};

    words.forEach((word: string) => {
      if (word.length > 3) {
        wordCount[word] = (wordCount[word] || 0) + 1;
      }
    });

    return Object.entries(wordCount)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([word]) => word);
  }

  private generatePotentialIdeas(bookmark: any): string[] {
    // This would be more sophisticated in a real implementation
    return [
      `Create a response video to "${bookmark.title}"`,
      `Make a tutorial based on the concepts in this video`,
      `Create a compilation featuring similar content`,
    ];
  }

  /**
   * Get most frequent words from an array of words
   */
  private getMostFrequentWords(words: string[]): string[] {
    const wordCount: { [key: string]: number } = {};

    words.forEach((word: string) => {
      if (word.length > 3) {
        wordCount[word] = (wordCount[word] || 0) + 1;
      }
    });

    return Object.entries(wordCount)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([word]) => word);
  }

  /**
   * Get bookmarks for idea generation based on criteria
   */
  private async getBookmarksForIdeaGeneration(
    userId: string,
    dto: GenerateIdeasFromBookmarksDto,
  ): Promise<any[]> {
    const query: any = {
      userId: new Types.ObjectId(userId),
      type: BookmarkType.VIDEO, // Focus on video bookmarks for idea generation
    };

    // Filter by specific bookmark IDs if provided
    if (dto.bookmarkIds && dto.bookmarkIds.length > 0) {
      try {
        // Try to convert to ObjectId, fallback to string if it fails
        const objectIds = dto.bookmarkIds.map(id => {
          try {
            return new Types.ObjectId(id);
          } catch (error) {
            this.logger.warn(`Invalid ObjectId format: ${id}, using as string`);
            return id;
          }
        });
        query._id = { $in: objectIds };
      } catch (error) {
        this.logger.error(`Error processing bookmark IDs: ${error.message}`);
        // Fallback to string matching
        query._id = { $in: dto.bookmarkIds };
      }
    }

    // Filter by platform if specified
    if (dto.platform) {
      query.platform = dto.platform;
    }

    // Filter by category/tags if specified
    if (dto.category) {
      query.tags = { $in: [new RegExp(dto.category, 'i')] };
    }

    this.logger.debug(`Query for bookmarks: ${JSON.stringify(query)}`);

    const bookmarks = await this.bookmarkModel.find(query).limit(20).exec();
    this.logger.debug(`Found ${bookmarks.length} bookmarks for idea generation`);
    return bookmarks;
  }

  /**
   * Analyze bookmarks to extract patterns and themes
   */
  private async analyzeBookmarksForIdeas(bookmarks: any[]): Promise<any> {
    const analysis = {
      commonThemes: this.extractCommonThemes(bookmarks),
      popularPlatforms: this.extractPopularPlatforms(bookmarks),
      trendingHashtags: this.extractTrendingHashtags(bookmarks),
      contentTypes: this.extractContentTypes(bookmarks),
      engagementPatterns: this.extractEngagementPatterns(bookmarks),
      creatorPatterns: this.extractCreatorPatterns(bookmarks),
    };

    this.logger.debug('Bookmark analysis completed:', {
      themes: analysis.commonThemes.length,
      platforms: analysis.popularPlatforms.length,
      hashtags: analysis.trendingHashtags.length,
    });

    return analysis;
  }

  /**
   * Generate ideas using AI based on bookmark analysis
   */
  private async generateIdeasWithAI(analysis: any, numberOfIdeas: number): Promise<any[]> {
    try {
      const prompt = this.buildIdeaGenerationPrompt(analysis, numberOfIdeas);

      const aiResponse = await this.openAIService.generatePostIdea({ prompt });

      // Parse the AI response to extract ideas
      const parsedIdeas = this.parseAIIdeaResponse(aiResponse, numberOfIdeas);

      return parsedIdeas;
    } catch (error) {
      this.logger.error('AI idea generation failed, falling back to rule-based generation:', error.message);
      return this.generateFallbackIdeas(analysis, numberOfIdeas);
    }
  }

  /**
   * Build prompt for AI idea generation
   */
  private buildIdeaGenerationPrompt(analysis: any, numberOfIdeas: number): string {
    return `Based on the following analysis of saved video bookmarks, generate ${numberOfIdeas} creative content ideas:

COMMON THEMES: ${analysis.commonThemes.join(', ')}
POPULAR PLATFORMS: ${analysis.popularPlatforms.join(', ')}
TRENDING HASHTAGS: ${analysis.trendingHashtags.join(', ')}
CONTENT TYPES: ${analysis.contentTypes.join(', ')}

Please generate creative, engaging content ideas that:
1. Build upon the identified themes and patterns
2. Are suitable for the popular platforms
3. Include relevant hashtags
4. Target the identified audience patterns
5. Have high engagement potential

For each idea, provide:
- Title
- Description
- Key elements to include
- Recommended hashtags
- Target audience
- Platform recommendation
- Estimated engagement score (1-100)

Format the response as a JSON array of idea objects.`;
  }

  /**
   * Parse AI response to extract structured ideas
   */
  private parseAIIdeaResponse(aiResponse: string, numberOfIdeas: number): any[] {
    try {
      // Try to parse JSON response
      const jsonMatch = aiResponse.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const ideas = JSON.parse(jsonMatch[0]);
        if (Array.isArray(ideas)) {
          return ideas.slice(0, numberOfIdeas).map(idea => ({
            title: idea.title || 'Generated Content Idea',
            description: idea.description || 'AI-generated content idea based on your bookmarks',
            keyElements: idea.keyElements || ['content', 'engagement'],
            hashtags: idea.hashtags || [],
            estimatedEngagement: idea.estimatedEngagement || 75,
            targetAudience: idea.targetAudience || 'Your audience',
            platform: idea.platform || 'youtube',
          }));
        }
      }

      // Fallback: parse text response into ideas
      return this.parseTextResponseToIdeas(aiResponse, numberOfIdeas);
    } catch (error) {
      this.logger.warn('Failed to parse AI response as JSON, using text parsing:', error.message);
      return this.parseTextResponseToIdeas(aiResponse, numberOfIdeas);
    }
  }

  /**
   * Parse text response into structured ideas
   */
  private parseTextResponseToIdeas(response: string, numberOfIdeas: number): any[] {
    const ideas = [];
    const lines = response.split('\n');

    let currentIdea: any = {};
    let ideaCount = 0;

    for (const line of lines) {
      const trimmedLine = line.trim();

      if (trimmedLine.toLowerCase().includes('title:') || trimmedLine.toLowerCase().includes('idea')) {
        if (currentIdea.title && ideaCount < numberOfIdeas) {
          ideas.push(this.completeIdea(currentIdea));
          ideaCount++;
        }
        currentIdea = {
          title: trimmedLine.replace(/title:\s*/i, '').replace(/idea\s*\d*:?\s*/i, ''),
        };
      } else if (trimmedLine.toLowerCase().includes('description:')) {
        currentIdea.description = trimmedLine.replace(/description:\s*/i, '');
      } else if (trimmedLine.toLowerCase().includes('hashtags:')) {
        const hashtags = trimmedLine.replace(/hashtags:\s*/i, '').split(/[,\s]+/).filter(h => h.startsWith('#'));
        currentIdea.hashtags = hashtags;
      } else if (trimmedLine.toLowerCase().includes('platform:')) {
        currentIdea.platform = trimmedLine.replace(/platform:\s*/i, '').toLowerCase();
      }
    }

    // Add the last idea if we have one
    if (currentIdea.title && ideaCount < numberOfIdeas) {
      ideas.push(this.completeIdea(currentIdea));
    }

    // If we don't have enough ideas, pad with generated ones
    while (ideas.length < numberOfIdeas) {
      ideas.push({
        title: `Content Idea #${ideas.length + 1}`,
        description: 'AI-generated content idea based on your bookmark patterns',
        keyElements: ['engaging', 'viral', 'trending'],
        hashtags: ['#content', '#viral'],
        estimatedEngagement: 70 + Math.random() * 20,
        targetAudience: 'Your audience',
        platform: 'youtube',
      });
    }

    return ideas.slice(0, numberOfIdeas);
  }

  /**
   * Complete an idea with default values
   */
  private completeIdea(idea: any): any {
    return {
      title: idea.title || 'Generated Content Idea',
      description: idea.description || 'AI-generated content idea based on your bookmarks',
      keyElements: idea.keyElements || ['content', 'engagement'],
      hashtags: idea.hashtags || ['#content'],
      estimatedEngagement: idea.estimatedEngagement || 75,
      targetAudience: idea.targetAudience || 'Your audience',
      platform: idea.platform || 'youtube',
    };
  }

  /**
   * Fallback idea generation when AI fails
   */
  private generateFallbackIdeas(analysis: any, numberOfIdeas: number): any[] {
    const ideas = [];

    // Generate ideas based on common themes
    analysis.commonThemes.slice(0, Math.ceil(numberOfIdeas / 2)).forEach((theme: string, index: number) => {
      ideas.push({
        title: `Create content about ${theme}`,
        description: `Develop engaging content around the ${theme} theme that resonates with your audience`,
        keyElements: [theme, 'engagement', 'authenticity'],
        hashtags: [`#${theme.replace(/\s+/g, '')}`, ...analysis.trendingHashtags.slice(0, 3)],
        estimatedEngagement: 75 + (index * 5),
        targetAudience: 'Your existing audience',
        platform: analysis.popularPlatforms[0] || 'youtube',
      });
    });

    // Generate ideas based on trending hashtags
    analysis.trendingHashtags.slice(0, Math.floor(numberOfIdeas / 2)).forEach((hashtag: string, index: number) => {
      ideas.push({
        title: `Trending content with #${hashtag}`,
        description: `Create content that leverages the trending hashtag #${hashtag} for maximum reach`,
        keyElements: [hashtag, 'trending', 'viral potential'],
        hashtags: [`#${hashtag}`, ...analysis.trendingHashtags.slice(0, 4)],
        estimatedEngagement: 80 + (index * 3),
        targetAudience: 'Trending audience',
        platform: analysis.popularPlatforms[0] || 'tiktok',
      });
    });

    return ideas.slice(0, numberOfIdeas);
  }

  /**
   * Extract common themes from bookmarks
   */
  private extractCommonThemes(bookmarks: any[]): string[] {
    const allWords = bookmarks.flatMap(bookmark =>
      (bookmark.title + ' ' + (bookmark.description || '')).toLowerCase().split(/\s+/)
    );

    return this.getMostFrequentWords(allWords);
  }

  /**
   * Extract popular platforms from bookmarks
   */
  private extractPopularPlatforms(bookmarks: any[]): string[] {
    const platformCount: { [key: string]: number } = {};
    bookmarks.forEach(bookmark => {
      if (bookmark.platform) {
        platformCount[bookmark.platform] = (platformCount[bookmark.platform] || 0) + 1;
      }
    });

    return Object.entries(platformCount)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3)
      .map(([platform]) => platform);
  }

  /**
   * Extract trending hashtags from bookmarks
   */
  private extractTrendingHashtags(bookmarks: any[]): string[] {
    const allHashtags = bookmarks.flatMap(bookmark => bookmark.tags || []);
    const hashtagCount: { [key: string]: number } = {};

    allHashtags.forEach(hashtag => {
      const cleanHashtag = hashtag.replace('#', '').toLowerCase();
      hashtagCount[cleanHashtag] = (hashtagCount[cleanHashtag] || 0) + 1;
    });

    return Object.entries(hashtagCount)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([hashtag]) => hashtag);
  }

  /**
   * Extract content types from bookmarks
   */
  private extractContentTypes(bookmarks: any[]): string[] {
    const types = new Set<string>();
    bookmarks.forEach(bookmark => {
      const contentType = this.detectContentType(bookmark.title, bookmark.description);
      if (contentType) {
        types.add(contentType);
      }
    });
    return Array.from(types);
  }

  /**
   * Extract engagement patterns from bookmarks
   */
  private extractEngagementPatterns(bookmarks: any[]): any {
    const patterns = {
      averageViews: 0,
      averageLikes: 0,
      averageComments: 0,
      highEngagementThreshold: 0,
    };

    const bookmarksWithMetrics = bookmarks.filter(b => b.metadata);
    if (bookmarksWithMetrics.length > 0) {
      patterns.averageViews = bookmarksWithMetrics.reduce((sum, b) => sum + (b.metadata.views || 0), 0) / bookmarksWithMetrics.length;
      patterns.averageLikes = bookmarksWithMetrics.reduce((sum, b) => sum + (b.metadata.likes || 0), 0) / bookmarksWithMetrics.length;
      patterns.averageComments = bookmarksWithMetrics.reduce((sum, b) => sum + (b.metadata.comments || 0), 0) / bookmarksWithMetrics.length;
      patterns.highEngagementThreshold = patterns.averageViews * 1.5;
    }

    return patterns;
  }

  /**
   * Extract creator patterns from bookmarks
   */
  private extractCreatorPatterns(bookmarks: any[]): any {
    const creators = new Set<string>();
    bookmarks.forEach(bookmark => {
      if (bookmark.creatorUsername) {
        creators.add(bookmark.creatorUsername);
      }
    });

    return {
      uniqueCreators: creators.size,
      creatorUsernames: Array.from(creators).slice(0, 5),
    };
  }
}
