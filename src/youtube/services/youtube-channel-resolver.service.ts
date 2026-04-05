import { Injectable, Logger, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError } from 'axios';
import { YouTubeQuotaMonitorService } from './youtube-quota-monitor.service';

export interface ChannelResolutionResult {
  channelId: string;
  username?: string;
  customUrl?: string;
  title: string;
  verified: boolean;
  subscriberCount: number;
  videoCount: number;
  description: string;
  thumbnailUrl: string;
  country?: string;
  publishedAt: string;
}

export interface ChannelResolutionError {
  code: string;
  message: string;
  details?: any;
  retryAfter?: number;
}

@Injectable()
export class YouTubeChannelResolverService {
  private readonly logger = new Logger(YouTubeChannelResolverService.name);
  private readonly apiKey: string;
  private readonly maxRetries = 3;
  private readonly retryDelay = 1000; // 1 second

  constructor(
    private readonly configService: ConfigService,
    private readonly quotaMonitor: YouTubeQuotaMonitorService,
  ) {
    this.apiKey = this.configService.get<string>('YOUTUBE_API_KEY');
    if (!this.apiKey) {
      this.logger.warn('YouTube API key not found in configuration');
    }
  }

  /**
   * Resolve channel information from various identifier formats
   * Supports: channel ID, username, custom URL, or search query
   */
  async resolveChannel(identifier: string): Promise<ChannelResolutionResult> {
    try {
      this.logger.log(`Resolving YouTube channel: ${identifier}`);

      // Check if it's already a channel ID
      if (this.isChannelId(identifier)) {
        return await this.getChannelById(identifier);
      }

      // Check if it's a custom URL
      if (this.isCustomUrl(identifier)) {
        return await this.getChannelByCustomUrl(identifier);
      }

      // For usernames, use search instead of deprecated forUsername parameter
      // YouTube's forUsername parameter is unreliable and often returns no results
      return await this.searchChannel(identifier);

    } catch (error) {
      const resolvedError = this.handleYouTubeError(error);
      throw resolvedError;
    }
  }

  /**
   * Check if the identifier is a valid YouTube channel ID
   */
  private isChannelId(identifier: string): boolean {
    // YouTube channel IDs start with UC and are 24 characters long
    return /^UC[a-zA-Z0-9_-]{22}$/.test(identifier);
  }

  /**
   * Check if the identifier is a custom URL
   */
  private isCustomUrl(identifier: string): boolean {
    // Custom URLs start with @ or contain /c/ or /channel/
    return identifier.startsWith('@') ||
           identifier.includes('/c/') ||
           identifier.includes('/channel/');
  }

  /**
   * Check if the identifier looks like a username
   */
  private isUsername(identifier: string): boolean {
    // More flexible username validation that allows spaces and apostrophes
    return identifier.length >= 3 &&
           identifier.length <= 50 &&
           !identifier.includes('/') &&
           !identifier.includes('@') &&
           !this.isChannelId(identifier);
  }

  /**
   * Get channel information by channel ID
   */
  private async getChannelById(channelId: string): Promise<ChannelResolutionResult> {
    const response = await this.makeYouTubeRequest('channels', {
      part: 'snippet,statistics,brandingSettings',
      id: channelId,
    });

    if (!response.data.items || response.data.items.length === 0) {
      throw new BadRequestException(`Channel not found: ${channelId}`);
    }

    return this.mapChannelData(response.data.items[0]);
  }

  /**
   * Get channel information by custom URL
   */
  private async getChannelByCustomUrl(customUrl: string): Promise<ChannelResolutionResult> {
    // Clean the custom URL
    const cleanUrl = customUrl.replace('@', '').replace('/c/', '').replace('/channel/', '');

    const response = await this.makeYouTubeRequest('channels', {
      part: 'snippet,statistics,brandingSettings',
      forUsername: cleanUrl,
    });

    if (!response.data.items || response.data.items.length === 0) {
      throw new BadRequestException(`Channel not found for custom URL: ${customUrl}`);
    }

    return this.mapChannelData(response.data.items[0]);
  }

  /**
   * Get channel information by username
   */
  private async getChannelByUsername(username: string): Promise<ChannelResolutionResult> {
    const response = await this.makeYouTubeRequest('channels', {
      part: 'snippet,statistics,brandingSettings',
      forUsername: username,
    });

    if (!response.data.items || response.data.items.length === 0) {
      throw new BadRequestException(`Channel not found for username: ${username}`);
    }

    return this.mapChannelData(response.data.items[0]);
  }

  /**
   * Search for channel by query
   */
  private async searchChannel(query: string): Promise<ChannelResolutionResult> {
    // Clean and normalize the query
    const cleanQuery = this.cleanSearchQuery(query);

    // Try multiple search strategies for better results
    const searchStrategies = [
      { q: cleanQuery, order: 'relevance' },
      { q: `"${cleanQuery}"`, order: 'relevance' }, // Exact phrase search
      { q: cleanQuery, order: 'viewCount' },
      { q: `${cleanQuery} channel`, order: 'relevance' },
      { q: `@${cleanQuery}`, order: 'relevance' },
      { q: cleanQuery.replace(/\s+/g, ''), order: 'relevance' }, // Remove spaces
      { q: cleanQuery.replace(/[^a-zA-Z0-9\s]/g, ''), order: 'relevance' }, // Remove special chars
    ];

    // Add strategies for numeric suffix usernames
    const numericSuffixMatch = cleanQuery.match(/^(.+?)(\d+)$/);
    if (numericSuffixMatch) {
      const [, baseName, suffix] = numericSuffixMatch;
      this.logger.log(`Detected numeric suffix username: base="${baseName}", suffix="${suffix}"`);

      // Prioritize exact matches first
      searchStrategies.unshift(
        { q: `"${cleanQuery}"`, order: 'relevance' }, // Exact full username with quotes
        { q: `@${cleanQuery}`, order: 'relevance' }, // @ with full username
        { q: `"@${cleanQuery}"`, order: 'relevance' }, // Exact @ with full username
        { q: cleanQuery, order: 'relevance' }, // Full username without quotes
      );

      // Add fallback strategies
      searchStrategies.push(
        { q: baseName, order: 'relevance' }, // Search without numeric suffix
        { q: `"${baseName}"`, order: 'relevance' }, // Exact base name
        { q: `${baseName} ${suffix}`, order: 'relevance' }, // Base name with space and suffix
        { q: `@${baseName}`, order: 'relevance' }, // @ with base name
        { q: `"@${baseName}"`, order: 'relevance' }, // Exact @ with base name
      );
    }

    for (const strategy of searchStrategies) {
      try {
        const result = await this.searchWithStrategy(cleanQuery, strategy);
        if (result) {
          return result;
        }
      } catch (error) {
        this.logger.warn(`Search strategy failed for ${cleanQuery}: ${error.message}`);
        continue;
      }
    }

    throw new BadRequestException(`No valid channels found for query: ${query}`);
  }

  /**
   * Clean and normalize search query for better YouTube search results
   */
  private cleanSearchQuery(query: string): string {
    // Trim whitespace
    let cleaned = query.trim();

    // Handle common variations
    cleaned = cleaned.replace(/\s+/g, ' '); // Normalize multiple spaces to single space

    // Handle apostrophes and special characters that might cause issues
    cleaned = cleaned.replace(/'/g, "'"); // Normalize apostrophes

    // Remove leading @ if present (we'll add it back in search strategies)
    cleaned = cleaned.replace(/^@/, '');

    // Handle numeric suffixes (like @barackouma2552)
    // Extract the base name and numeric suffix
    const numericSuffixMatch = cleaned.match(/^(.+?)(\d+)$/);
    if (numericSuffixMatch) {
      const [, baseName, suffix] = numericSuffixMatch;
      // Keep both the full name and base name for search
      this.logger.log(`Detected numeric suffix in username: ${baseName}${suffix}`);
    }

    return cleaned;
  }

  /**
   * Normalize text for matching (remove special chars, normalize spaces, etc.)
   */
  private normalizeForMatching(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, '') // Remove special characters except word chars and spaces
      .replace(/\s+/g, ' ') // Normalize multiple spaces to single space
      .trim();
  }

  /**
   * Calculate partial match score between two strings
   */
  private calculatePartialMatch(query: string, title: string): number {
    const queryWords = query.split(' ').filter(word => word.length > 0);
    const titleWords = title.split(' ').filter(word => word.length > 0);

    if (queryWords.length === 0 || titleWords.length === 0) {
      return 0;
    }

    let matchCount = 0;
    for (const queryWord of queryWords) {
      for (const titleWord of titleWords) {
        if (titleWord.includes(queryWord) || queryWord.includes(titleWord)) {
          matchCount++;
          break;
        }
      }
    }

    return matchCount / queryWords.length;
  }

  /**
   * Search with a specific strategy
   */
  private async searchWithStrategy(query: string, strategy: any): Promise<ChannelResolutionResult | null> {
    const searchResponse = await this.makeYouTubeRequest('search', {
      part: 'snippet',
      q: strategy.q,
      type: 'channel',
      maxResults: 10,
      order: strategy.order,
    });

    if (!searchResponse.data.items || searchResponse.data.items.length === 0) {
      return null;
    }

    // Find the best matching channel based on subscriber count and relevance
    let bestChannel = null;
    let bestScore = 0;

    for (const item of searchResponse.data.items) {
      const channelId = item.id.channelId;

      try {
        // Get detailed channel information
        const channelResponse = await this.makeYouTubeRequest('channels', {
          part: 'snippet,statistics',
          id: channelId,
        });

        if (channelResponse.data.items && channelResponse.data.items.length > 0) {
          const channel = channelResponse.data.items[0];
          const snippet = channel.snippet;
          const statistics = channel.statistics;

          // Calculate relevance score
          const subscriberCount = parseInt(statistics.subscriberCount) || 0;
          const normalizedQuery = this.normalizeForMatching(query);
          const normalizedTitle = this.normalizeForMatching(snippet.title);
          const normalizedDescription = this.normalizeForMatching(snippet.description);
          const customUrl = snippet.customUrl || '';

          const titleMatch = normalizedTitle.includes(normalizedQuery);
          const descriptionMatch = normalizedDescription.includes(normalizedQuery);
          const exactTitleMatch = normalizedTitle === normalizedQuery;
          const partialTitleMatch = this.calculatePartialMatch(normalizedQuery, normalizedTitle);

          // Check for custom URL match (exact match with @ prefix)
          const customUrlMatch = customUrl && this.normalizeForMatching(customUrl) === normalizedQuery;
          const exactCustomUrlMatch = customUrl && customUrl.toLowerCase() === query.toLowerCase().replace('@', '');

          // Handle exact numeric suffix matching (most important for this case)
          let exactNumericSuffixMatch = false;
          const queryNumericMatch = query.match(/^(.+?)(\d+)$/);
          const titleNumericMatch = snippet.title.match(/^(.+?)(\d+)$/);

          if (queryNumericMatch && titleNumericMatch) {
            const [, queryBase, querySuffix] = queryNumericMatch;
            const [, titleBase, titleSuffix] = titleNumericMatch;

            // Check if base names match AND numeric suffixes match exactly
            if (this.normalizeForMatching(queryBase) === this.normalizeForMatching(titleBase) &&
                querySuffix === titleSuffix) {
              exactNumericSuffixMatch = true;
            }
          }

          let score = 1; // Start with base score instead of subscriber count

          // Exact matches get ABSOLUTE highest priority (regardless of subscriber count)
          if (exactTitleMatch || exactCustomUrlMatch || exactNumericSuffixMatch) {
            score = 1000000; // Maximum score for exact matches
            this.logger.log(`Exact match found for query "${query}": title="${snippet.title}", customUrl="${customUrl}"`);
          } else if (customUrlMatch) {
            score = 500000; // Very high score for custom URL matches
          } else if (titleMatch) {
            score = subscriberCount * 10; // Boost based on subscribers for partial matches
          } else {
            score = subscriberCount; // Use subscriber count as base for other matches
          }

          if (descriptionMatch && !exactTitleMatch) score *= 1.5; // Boost score if description matches
          if (partialTitleMatch > 0.7) score *= 1.8; // Boost for high partial match
          if (partialTitleMatch > 0.5) score *= 1.3; // Boost for medium partial match

          // Prefer verified channels (but not if we have exact match)
          if (snippet.verified && !exactTitleMatch) score *= 1.2;

          this.logger.log(`Channel "${snippet.title}" (${customUrl || 'no-custom-url'}): score=${score}, exactMatch=${exactTitleMatch || exactCustomUrlMatch || exactNumericSuffixMatch}, subscribers=${subscriberCount}`);

          if (score > bestScore) {
            bestScore = score;
            bestChannel = channel;
            this.logger.log(`New best channel: "${snippet.title}" with score ${score}`);
          }
        }
      } catch (error) {
        this.logger.warn(`Failed to get details for channel ${channelId}: ${error.message}`);
        continue;
      }
    }

    return bestChannel ? this.mapChannelData(bestChannel) : null;
  }

  /**
   * Make a YouTube API request with retry logic and error handling
   */
  private async makeYouTubeRequest(endpoint: string, params: any, retryCount = 0): Promise<any> {
    try {
      // Check quota before making request
      const canMakeRequest = await this.quotaMonitor.canMakeRequest(endpoint);
      if (!canMakeRequest) {
        throw new InternalServerErrorException({
          message: 'YouTube API quota exceeded',
          details: 'The YouTube API quota has been exceeded. Please try again later.',
          code: 'QUOTA_EXCEEDED'
        });
      }

      const response = await axios.get(`https://www.googleapis.com/youtube/v3/${endpoint}`, {
        params: {
          ...params,
          key: this.apiKey,
        },
        timeout: 10000, // 10 second timeout
      });

      // Record quota usage after successful request
      await this.quotaMonitor.recordQuotaUsage(endpoint);

      return response;
    } catch (error) {
      if (retryCount < this.maxRetries && this.isRetryableError(error)) {
        this.logger.warn(`YouTube API request failed, retrying (${retryCount + 1}/${this.maxRetries}): ${error.message}`);
        await this.delay(this.retryDelay * Math.pow(2, retryCount)); // Exponential backoff
        return this.makeYouTubeRequest(endpoint, params, retryCount + 1);
      }

      throw error;
    }
  }

  /**
   * Check if an error is retryable
   */
  private isRetryableError(error: any): boolean {
    if (error instanceof AxiosError) {
      const status = error.response?.status;
      // Retry on 5xx errors and rate limits
      return status >= 500 || status === 429;
    }
    return false;
  }

  /**
   * Handle YouTube API errors and convert them to appropriate exceptions
   */
  private handleYouTubeError(error: any): Error {
    if (error instanceof AxiosError) {
      const status = error.response?.status;
      const data = error.response?.data;

      switch (status) {
        case 400:
          if (data?.error?.code === 400) {
            return new BadRequestException({
              message: 'Invalid request parameters',
              details: data.error.message,
              code: 'INVALID_PARAMETERS'
            });
          }
          break;

        case 403:
          if (data?.error?.code === 403) {
            if (data.error.message?.includes('quota') || data.error.reason === 'quotaExceeded') {
              return new InternalServerErrorException({
                message: 'YouTube API quota exceeded',
                details: 'The YouTube API quota has been exceeded. Please try again later or contact support.',
                code: 'QUOTA_EXCEEDED',
                retryAfter: 3600 // Suggest retry after 1 hour
              });
            }
            return new BadRequestException({
              message: 'Access forbidden',
              details: data.error.message,
              code: 'ACCESS_FORBIDDEN'
            });
          }
          break;

        case 404:
          return new BadRequestException({
            message: 'Channel not found',
            details: 'The specified channel could not be found',
            code: 'CHANNEL_NOT_FOUND'
          });

        case 429:
          const retryAfter = error.response?.headers?.['retry-after'];
          return new InternalServerErrorException({
            message: 'Rate limit exceeded',
            details: 'Too many requests to YouTube API',
            code: 'RATE_LIMIT_EXCEEDED',
            retryAfter: retryAfter ? parseInt(retryAfter) : undefined
          });

        case 500:
        case 502:
        case 503:
        case 504:
          return new InternalServerErrorException({
            message: 'YouTube API service unavailable',
            details: 'The YouTube API is currently experiencing issues',
            code: 'SERVICE_UNAVAILABLE'
          });
      }
    }

    // If it's already a NestJS exception, return it as is
    if (error instanceof BadRequestException || error instanceof InternalServerErrorException) {
      return error;
    }

    // Default error handling
    this.logger.error('Unexpected YouTube API error:', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
      stack: error.stack
    });

    return new InternalServerErrorException({
      message: 'Failed to resolve YouTube channel',
      details: error.message,
      code: 'UNKNOWN_ERROR'
    });
  }

  /**
   * Map YouTube API response to our interface
   */
  private mapChannelData(channel: any): ChannelResolutionResult {
    const snippet = channel.snippet;
    const statistics = channel.statistics;

    return {
      channelId: channel.id,
      username: snippet.customUrl?.replace('@', ''),
      customUrl: snippet.customUrl,
      title: snippet.title,
      verified: snippet.verified || false,
      subscriberCount: parseInt(statistics.subscriberCount) || 0,
      videoCount: parseInt(statistics.videoCount) || 0,
      description: snippet.description,
      thumbnailUrl: snippet.thumbnails?.high?.url || snippet.thumbnails?.medium?.url,
      country: snippet.country,
      publishedAt: snippet.publishedAt,
    };
  }

  /**
   * Utility function for delays
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Batch resolve multiple channels
   */
  async resolveChannels(identifiers: string[]): Promise<Map<string, ChannelResolutionResult>> {
    const results = new Map<string, ChannelResolutionResult>();
    const errors: string[] = [];

    for (const identifier of identifiers) {
      try {
        const result = await this.resolveChannel(identifier);
        results.set(identifier, result);

        // Add small delay to avoid rate limiting
        await this.delay(100);
      } catch (error) {
        errors.push(`${identifier}: ${error.message}`);
        this.logger.warn(`Failed to resolve channel ${identifier}: ${error.message}`);
      }
    }

    if (errors.length > 0) {
      this.logger.warn(`Some channels failed to resolve: ${errors.join(', ')}`);
    }

    return results;
  }
}
