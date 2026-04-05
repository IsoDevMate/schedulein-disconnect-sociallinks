/* eslint-disable prettier/prettier */
import { Injectable, Logger, Inject, forwardRef } from "@nestjs/common";
import { google } from "googleapis";
import { AuthService } from "../auth/auth.service";
import { ConfigService } from "@nestjs/config";
import {
  ShortsMetricsDto,
  ShortsAnalyticsResponseDto,
} from "./dto/youtube-analytics.dto";
import { getTimeRangeStartISO } from "./utils/time-range.util";
import { EnhancedNicheClassificationService } from "./services/enhanced-niche-classification.service";
import { YouTubeQuotaMonitorService } from "./services/youtube-quota-monitor.service";
import { UsersService } from "../users/users.service";

@Injectable()
export class YouTubeAnalyticsService {
  private readonly logger = new Logger(YouTubeAnalyticsService.name);
  private readonly youtube = google.youtube("v3");




  private readonly configService: ConfigService;

  constructor(
    @Inject(forwardRef(() => AuthService))
    private readonly authService: AuthService,
    configService: ConfigService,
    private readonly enhancedNicheClassificationService: EnhancedNicheClassificationService,
    private readonly quotaMonitorService: YouTubeQuotaMonitorService,
    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,
  ) {
    this.configService = configService;
  }

  /**
   * Check quota status before making API calls
   */
  async checkQuotaStatus(): Promise<any> {
    return this.quotaMonitorService.checkQuotaStatus();
  }

  /**
   * Build comprehensive search keywords using niche definitions
   */
  private async buildComprehensiveSearchKeywords(niche: string): Promise<string[]> {
    try {
      // Get niche definition from injected service
      const nicheDefinition = await this.enhancedNicheClassificationService.getNicheDefinition(niche);

      if (!nicheDefinition) {
        this.logger.warn(`Niche definition not found for: ${niche}, using fallback`);
        return this.getFallbackSearchKeywords(niche);
      }

      const keywords: string[] = [];
      const nicheKeywords = nicheDefinition.keywords || [];

      // Build comprehensive search terms with priority ranking
      const priorityKeywords = nicheKeywords.slice(0, 5); // Top 5 keywords get full treatment
      const secondaryKeywords = nicheKeywords.slice(5, 10); // Next 5 get basic treatment

      // High priority keywords - full combinations
      priorityKeywords.forEach(keyword => {
        keywords.push(`${keyword} shorts`);
        keywords.push(`${keyword} short videos`);
        keywords.push(`${keyword} #shorts`);
        keywords.push(`${keyword} trending`);
        keywords.push(`${keyword} viral`);
        keywords.push(`${keyword} popular`);
        keywords.push(`#${keyword}`);
        keywords.push(keyword);

        // Advanced combinations for better discovery
        keywords.push(`${keyword} workout`);
        keywords.push(`${keyword} tutorial`);
        keywords.push(`${keyword} tips`);
        keywords.push(`${keyword} guide`);
        keywords.push(`${keyword} review`);
        keywords.push(`${keyword} challenge`);
      });

      // Secondary keywords - basic combinations only
      secondaryKeywords.forEach(keyword => {
        keywords.push(`${keyword} shorts`);
        keywords.push(`${keyword} trending`);
        keywords.push(`${keyword} viral`);
        keywords.push(`#${keyword}`);
        keywords.push(keyword);
      });

      // Add niche-specific combinations
      keywords.push(`${niche} shorts`);
      keywords.push(`${niche} short videos`);
      keywords.push(`${niche} #shorts`);
      keywords.push(`${niche} trending`);
      keywords.push(`${niche} viral`);
      keywords.push(`${niche} popular`);
      keywords.push(`#${niche}`);
      keywords.push(niche);

      // Remove duplicates and prioritize outlier-finding keywords
      const uniqueKeywords = [...new Set(keywords)];

      // Sort by priority: trending/viral keywords first, then specific terms
      const sortedKeywords = uniqueKeywords.sort((a, b) => {
        const aPriority = this.getKeywordPriority(a);
        const bPriority = this.getKeywordPriority(b);
        return bPriority - aPriority;
      });

      // Limit to reasonable number but ensure we have good coverage
      const finalKeywords = sortedKeywords.slice(0, 25);

      this.logger.log(`Built comprehensive search keywords for "${niche}": ${finalKeywords.slice(0, 5).join(', ')}... (${finalKeywords.length} total)`);

      return finalKeywords;
    } catch (error) {
      this.logger.warn(`Failed to build comprehensive search keywords: ${error.message}, using fallback`);
      return this.getFallbackSearchKeywords(niche);
    }
  }

  /**
   * Get priority score for keyword (higher = better for finding outliers)
   */
  private getKeywordPriority(keyword: string): number {
    let priority = 0;

    // High priority terms for finding outliers
    if (keyword.includes('trending')) priority += 10;
    if (keyword.includes('viral')) priority += 10;
    if (keyword.includes('popular')) priority += 8;
    if (keyword.includes('shorts')) priority += 6;
    if (keyword.includes('#')) priority += 5;

    // Medium priority terms
    if (keyword.includes('challenge')) priority += 4;
    if (keyword.includes('tips')) priority += 3;
    if (keyword.includes('tutorial')) priority += 3;
    if (keyword.includes('guide')) priority += 3;

    // Lower priority terms
    if (keyword.includes('review')) priority += 2;
    if (keyword.includes('workout')) priority += 2;

    // Bonus for shorter keywords (more likely to match)
    if (keyword.length < 15) priority += 1;

    return priority;
  }

  /**
   * Fallback search keywords when comprehensive method fails
   */
  private getFallbackSearchKeywords(niche: string): string[] {
    return [
      `${niche} shorts`,
      `${niche} short videos`,
      `${niche} #shorts`,
      `${niche} trending`,
      `${niche} viral`,
      `${niche} popular`,
      `#${niche}`,
      niche,
    ];
  }

  parseDuration(duration: string): number {
    // Parse ISO 8601 duration format (e.g., PT1M30S)
    const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
    if (!match) return 0;

    const hours = match[1] ? parseInt(match[1]) : 0;
    const minutes = match[2] ? parseInt(match[2]) : 0;
    const seconds = match[3] ? parseInt(match[3]) : 0;

    return hours * 3600 + minutes * 60 + seconds;
  }

  calculateOptimalDuration(durations: number[]): number {
    if (!durations.length) return 30; // Default to 30s if no data

    // Calculate median duration
    const sorted = [...durations].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0
      ? sorted[mid]
      : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  }

  calculateBenchmarkEngagement(videos: any[]): number {
    if (!videos.length) return 0;

    // Calculate average engagement rate
    const totalEngagement = videos.reduce(
      (sum, v) => sum + v.engagementRate,
      0,
    );
    return totalEngagement / videos.length;
  }

  assessCompetitionLevel(videos: any[]): "Low" | "Medium" | "High" {
    if (!videos.length) return "Low";

    // Calculate competition level based on view distribution
    const totalViews = videos.reduce((sum, v) => sum + v.viewCount, 0);
    const avgViews = totalViews / videos.length;

    // Count videos above average views
    const aboveAvg = videos.filter((v) => v.viewCount > avgViews).length;
    const ratio = aboveAvg / videos.length;

    if (ratio < 0.2) return "High";
    if (ratio < 0.5) return "Medium";
    return "Low";
  }

  assessGrowthOpportunity(videos: any[]): "Low" | "Medium" | "High" {
    if (!videos.length) return "Medium";

    // Calculate engagement rate distribution
    const engagementRates = videos
      .map((v) => v.engagementRate)
      .sort((a, b) => a - b);
    const medianEngagement =
      engagementRates[Math.floor(engagementRates.length / 2)];

    // Count videos with above median engagement but below median views
    const medianViews = [...videos].sort((a, b) => a.viewCount - b.viewCount)[
      Math.floor(videos.length / 2)
    ].viewCount;

    const opportunityVideos = videos.filter(
      (v) => v.engagementRate > medianEngagement && v.viewCount < medianViews,
    );

    const opportunityRatio = opportunityVideos.length / videos.length;

    if (opportunityRatio > 0.3) return "High";
    if (opportunityRatio > 0.15) return "Medium";
    return "Low";
  }

  async getTrendingShorts(
    userId: string,
    maxResults = 10,
    options: {
      regionCode?: string;
      categoryId?: string;
      fallbackRegions?: boolean;
    } = {},
  ): Promise<ShortsMetricsDto[]> {
    // Use the comprehensive approach for better Shorts discovery
    return this.getComprehensiveShorts(userId, maxResults, {
      regionCode: options.regionCode,
      categoryId: options.categoryId,
      useSearch: true,
      useTrending: true,
      usePlaylists: false, // Disable playlists for trending to avoid too many API calls
    });
  }

  async getVideoDetails(videoId: string, userId?: string): Promise<any> {
    try {
      const authUserId = userId || "687ff8258f19eef4a5c05124";
      const youtube = await this.getAuthenticatedYoutube(authUserId);
      const response = await youtube.videos.list({
        part: ["snippet", "contentDetails", "statistics", "status"],
        id: [videoId],
      });

      if (!response.data.items || response.data.items.length === 0) {
        throw new Error(`Video with ID ${videoId} not found`);
      }

      return response.data.items[0];
    } catch (error) {
      this.logger.error(`Error getting details for video ${videoId}:`, error);
      throw new Error(` ${error.message}`);
    }
  }

  private async getAuthenticatedYoutube(userId: string) {
    try {
      const accessToken =
        await this.authService.getValidYouTubeAccessToken(userId);
      const auth = new google.auth.OAuth2();
      auth.setCredentials({ access_token: accessToken });
      return google.youtube({ version: "v3", auth });
    } catch (error) {
      this.logger.warn(
        `Legacy YouTube token not found for user ${userId}, attempting V2 identity fallback...`,
      );
      try {
        const user: any = await this.usersService.findById(userId);
        const identity = user?.identities?.find(
          (i: any) => i.platform === "youtube" && i.isActive,
        );
        const identityAccessToken = identity?.youtubeAccessToken;
        const identityRefreshToken = identity?.youtubeRefreshToken;

        if (!identityAccessToken && !identityRefreshToken) {
          throw new Error("No YouTube identity tokens in v2 identities");
        }

        const auth = new google.auth.OAuth2();

        if (identityAccessToken) {
          auth.setCredentials({ access_token: identityAccessToken });
          return google.youtube({ version: "v3", auth });
        }

        // If only refresh token exists, try to refresh via OAuth2 client
        if (identityRefreshToken) {
          try {
            auth.setCredentials({ refresh_token: identityRefreshToken });
            const { credentials } = await auth.refreshAccessToken();
            auth.setCredentials({ access_token: credentials.access_token });
            return google.youtube({ version: "v3", auth });
          } catch (refreshErr) {
            this.logger.error(
              `Failed to refresh YouTube access token from v2 identity for user ${userId}:`,
              refreshErr,
            );
            throw new Error("Failed to refresh YouTube token from v2 identity");
          }
        }
      } catch (v2err) {
        this.logger.error(
          `Failed to get authenticated YouTube for user ${userId} using both legacy and v2 identity tokens:`,
          v2err,
        );
        throw new Error(
          `YouTube authentication failed: ${error?.message || "legacy"}; v2: ${v2err?.message}`,
        );
      }
    }
  }

  async searchShortsByKeyword(
    userId: string,
    keyword: string,
    maxResults = 10,
    options: {
      sortBy?: "relevance" | "date" | "viewCount" | "rating";
      publishedAfter?: string;
      regionCode?: string;
    } = {},
  ): Promise<ShortsMetricsDto[]> {
    try {
      const youtube = await this.getAuthenticatedYoutube(userId);
      const { sortBy = "viewCount", publishedAfter, regionCode } = options;

      // First, search for videos with the Shorts filter
      const searchResponse = await youtube.search.list({
        part: ["snippet"],
        q: keyword,
        type: ["video"],
        videoDuration: "short",
        maxResults: Math.min(maxResults * 3, 50), // Get more to account for non-Shorts
        videoDefinition: "high",
        order: sortBy,
        publishedAfter,
        regionCode,
        safeSearch: "moderate",
      });

      // Record quota usage
      await this.quotaMonitorService.recordQuotaUsage('search', 100);

      // Extract video IDs from search results
      const videoIds = searchResponse.data.items
        .filter((item) => item.id?.videoId)
        .map((item) => item.id.videoId);

      if (videoIds.length === 0) return [];

      // Get detailed metrics for the videos to ensure they're actually Shorts
      const allShorts = await this.getShortsMetrics(userId, videoIds);

      // Sort by view count (highest first) and return requested number of results
      return allShorts
        .sort((a, b) => b.viewCount - a.viewCount)
        .slice(0, maxResults);
    } catch (error) {
      this.logger.error("Error searching for Shorts by keyword:", error);
      throw new Error(`Failed to search for Shorts: ${error.message}`);
    }
  }
  /**
   * Get metrics for specific Shorts videos
   */
  async getShortsMetrics(
    userId: string,
    videoIds: string[],
  ): Promise<ShortsMetricsDto[]> {
    if (!videoIds.length) return [];

    try {
      const youtube = await this.getAuthenticatedYoutube(userId);
      const batchSize = 50; // YouTube API limit per request
      const batches = [];

      // Split into batches of 50 (YouTube API limit)
      for (let i = 0; i < videoIds.length; i += batchSize) {
        const batch = videoIds.slice(i, i + batchSize);
        batches.push(batch);
      }

      // Process batches in parallel
      const results = await Promise.all(
        batches.map(async (batch) => {
          const response = await youtube.videos.list({
            part: ["snippet", "statistics", "contentDetails"],
            id: batch,
            maxResults: batchSize,
          });
          return response.data.items || [];
        }),
      );

      // Flatten results and process
      const allItems = results.flat();

      // Filter for Shorts and map to our DTO
      return allItems
        .filter((item) => this.isShortsVideo(item))
        .map((item) => this.mapShortsItem(item));
    } catch (error) {
      this.logger.error("Error getting Shorts metrics:", error);
      throw new Error(`Failed to fetch Shorts metrics: ${error.message}`);
    }
  }

  /**
   * Get Shorts from a channel using the UUSH playlist pattern
   * This is a workaround since YouTube doesn't officially support Shorts filtering
   */
  private getShortsPlaylistId(channelId: string): string {
    // Replace 'UC' prefix with 'UUSH' to get the Shorts playlist
    if (channelId.startsWith("UC")) {
      return "UUSH" + channelId.substring(2);
    }
    return channelId; // Fallback to original ID if not in UC format
  }

  /**
   * Get channel Shorts using the UUSH playlist pattern
   */
  async getChannelShorts(
    userId: string,
    channelId: string,
    maxResults = 10,
  ): Promise<any> {
    // Changed return type to any as ChannelShortsResponseDto is removed
    try {
      const youtube = await this.getAuthenticatedYoutube(userId);
      const shortsPlaylistId = this.getShortsPlaylistId(channelId);

      // First, get the playlist items
      const response = await youtube.playlistItems.list({
        part: ["snippet", "contentDetails"],
        playlistId: shortsPlaylistId,
        maxResults: Math.min(maxResults, 50),
      });

      const videoIds = response.data.items
        .filter((item) => item.snippet?.resourceId?.videoId)
        .map((item) => item.snippet.resourceId.videoId);

      if (videoIds.length === 0) {
        return {
          channelId,
          totalShorts: 0,
          averageViews: 0,
          averageLikes: 0,
          averageEngagementRate: 0,
          shorts: [],
          lastUpdated: new Date().toISOString(),
        };
      }

      // Get detailed metrics for these videos
      const shorts = await this.getShortsMetrics(userId, videoIds);

      // Calculate averages
      const totalViews = shorts.reduce((sum, s) => sum + s.viewCount, 0);
      const totalLikes = shorts.reduce((sum, s) => sum + s.likeCount, 0);
      const totalEngagementRate = shorts.reduce(
        (sum, s) => sum + s.engagementRate,
        0,
      );

      return {
        channelId,
        totalShorts: shorts.length,
        averageViews: Math.round(totalViews / shorts.length) || 0,
        averageLikes: Math.round(totalLikes / shorts.length) || 0,
        averageEngagementRate:
          parseFloat((totalEngagementRate / shorts.length).toFixed(2)) || 0,
        shorts,
        lastUpdated: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error("Error getting channel Shorts:", error);
      // Return empty result if the playlist approach fails
      return {
        channelId,
        totalShorts: 0,
        averageViews: 0,
        averageLikes: 0,
        averageEngagementRate: 0,
        shorts: [],
        lastUpdated: new Date().toISOString(),
      };
    }
  }

  /**
   * Get channel analytics focusing on Shorts content
   */
  async analyzeChannelShorts(
    userId: string,
    channelId: string,
    maxShorts = 10,
  ): Promise<ShortsAnalyticsResponseDto> {
    try {
      // First try the UUSH playlist method
      const channelShorts = await this.getChannelShorts(
        userId,
        channelId,
        maxShorts,
      );

      if (channelShorts.shorts.length > 0) {
        // If we got Shorts from the playlist, return them
        return {
          shorts: channelShorts.shorts,
          channel: {
            channelId: channelShorts.channelId,
            channelTitle: channelShorts.shorts[0]?.channelTitle || "Unknown",
            subscriberCount: 0, // This would need to be fetched from the channel endpoint
            totalShortsViews:
              channelShorts.averageViews * channelShorts.totalShorts,
            shortsCount: channelShorts.totalShorts,
            averageEngagementRate: channelShorts.averageEngagementRate,
            averageViewsPerShort: channelShorts.averageViews,
            lastUpdated: channelShorts.lastUpdated,
          },
          totalViews: channelShorts.averageViews * channelShorts.totalShorts,
          totalEngagement: Math.round(
            (channelShorts.averageEngagementRate / 100) *
              channelShorts.averageViews *
              channelShorts.totalShorts,
          ),
          averageEngagementRate: channelShorts.averageEngagementRate,
          dateRange: {
            start: new Date(
              Date.now() - 30 * 24 * 60 * 60 * 1000,
            ).toISOString(), // Last 30 days
            end: new Date().toISOString(),
          },
        };
      }

      // Fall back to the traditional method if playlist approach didn't return any Shorts
      this.logger.log(
        `No Shorts found via UUSH playlist for channel ${channelId}, falling back to traditional method`,
      );

      // Get channel info
      const youtube = await this.getAuthenticatedYoutube(userId);
      const channelResponse = await youtube.channels.list({
        part: ["snippet", "statistics", "contentDetails"],
        id: [channelId],
        maxResults: 1,
      });

      const channel = channelResponse.data.items?.[0];
      if (!channel) {
        throw new Error("Channel not found");
      }

      // Get uploads playlist ID
      const uploadsPlaylistId = channel.contentDetails.relatedPlaylists.uploads;
      if (!uploadsPlaylistId) {
        throw new Error("Could not find uploads playlist for channel");
      }

      // Get channel's uploads
      const videosResponse = await youtube.playlistItems.list({
        part: ["snippet", "contentDetails"],
        playlistId: uploadsPlaylistId,
        maxResults: Math.min(maxShorts * 2, 50), // Get more to account for non-Shorts
      });

      const videoItems = videosResponse.data.items || [];
      if (videoItems.length === 0) {
        return {
          shorts: [],
          channel: {
            channelId,
            channelTitle: channel.snippet?.title || "Unknown",
            subscriberCount: parseInt(
              channel.statistics?.subscriberCount || "0",
            ),
            totalShortsViews: 0,
            shortsCount: 0,
            averageEngagementRate: 0,
            averageViewsPerShort: 0,
            lastUpdated: new Date().toISOString(),
          },
          totalViews: 0,
          totalEngagement: 0,
          averageEngagementRate: 0,
          dateRange: {
            start: new Date(0).toISOString(),
            end: new Date().toISOString(),
          },
        };
      }

      // Get video details to filter for Shorts
      const videoIds = videoItems.map((item) => item.contentDetails.videoId);
      const shorts = await this.getShortsMetrics(userId, videoIds);

      // Sort by view count (highest first) and limit to maxShorts
      const sortedShorts = shorts
        .sort((a, b) => b.viewCount - a.viewCount)
        .slice(0, maxShorts);

      // Calculate metrics
      const totalShorts = sortedShorts.length;
      const totalViews = sortedShorts.reduce((sum, s) => sum + s.viewCount, 0);
      const totalEngagement = sortedShorts.reduce(
        (sum, s) => sum + s.likeCount + s.commentCount,
        0,
      );
      const averageEngagementRate =
        totalShorts > 0
          ? parseFloat(((totalEngagement / totalViews) * 100).toFixed(2))
          : 0;

      return {
        shorts: sortedShorts,
        channel: {
          channelId,
          channelTitle: channel.snippet?.title || "Unknown",
          subscriberCount: parseInt(channel.statistics?.subscriberCount || "0"),
          totalShortsViews: totalViews,
          shortsCount: totalShorts,
          averageEngagementRate,
          averageViewsPerShort:
            totalShorts > 0 ? Math.round(totalViews / totalShorts) : 0,
          lastUpdated: new Date().toISOString(),
        },
        totalViews,
        totalEngagement,
        averageEngagementRate,
        dateRange: {
          start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          end: new Date().toISOString(),
        },
      };
    } catch (error) {
      this.logger.error("Error analyzing channel Shorts:", error);
      throw new Error(`Failed to analyze channel Shorts: ${error.message}`);
    }
  }

  /**
   * Enhanced method to check if a video is a YouTube Short using multiple signals
   * Based on latest YouTube Shorts criteria and research
   * @param item Video item from YouTube API
   * @returns boolean indicating if the video is a Short
   */
  private isShortsVideo(item: any): boolean {
    if (!item) return false;

    const videoId = item.id?.videoId || item.id;
    const snippet = item.snippet || {};
    const contentDetails = item.contentDetails || {};
    const title = (snippet.title || "").toLowerCase();
    const description = (snippet.description || "").toLowerCase();

    // 1. Check duration (primary indicator) - Updated for 3-minute Shorts
    let duration = 0;
    if (contentDetails.duration) {
      const match = contentDetails.duration.match(
        /PT(?:([0-9]+)H)?(?:([0-9]+)M)?(?:([0-9]+)S)?/,
      );
      if (match) {
        const hours = parseInt(match[1] || "0", 10);
        const minutes = parseInt(match[2] || "0", 10);
        const seconds = parseInt(match[3] || "0", 10);
        duration = hours * 3600 + minutes * 60 + seconds;
      }
    }

    // Duration-based detection (most reliable)
    // Updated to support up to 3 minutes for Shorts (180 seconds)
    if (duration > 0 && duration <= 180) {
      // If duration is 3 minutes or less, it could be a Short
      // But we need additional signals to confirm

      // Check for explicit Shorts indicators
      const hasShortsTag =
        title.includes("#shorts") ||
        description.includes("#shorts") ||
        title.includes("short") ||
        description.includes("short video");

      // Check for Shorts URL pattern in description
      const hasShortsUrl =
        videoId &&
        (description.includes(`youtube.com/shorts/${videoId}`) ||
          description.includes(`youtu.be/shorts/${videoId}`));

      // Check if it's from a Shorts playlist (very reliable)
      const isFromShortsPlaylist = snippet.playlistId?.startsWith("UUSH");

      // Check for explicit Shorts flag in API response
      const hasShortsFlag = snippet.shortVideo === true;

      // Check for aspect ratio indicators (if available)
      const hasVerticalThumbnail = this.isVerticalThumbnail(snippet.thumbnails);

      // Check for channel patterns (channels that primarily create Shorts)
      const isFromShortsChannel = this.isShortsChannel(snippet.channelId);

      // Scoring system for more accurate detection
      let shortsScore = 0;

      // High confidence indicators
      if (isFromShortsPlaylist) shortsScore += 5;
      if (hasShortsFlag) shortsScore += 5;
      if (hasShortsUrl) shortsScore += 4;

      // Medium confidence indicators
      if (hasShortsTag) shortsScore += 3;
      if (hasVerticalThumbnail) shortsScore += 2;
      if (isFromShortsChannel) shortsScore += 2;

      // Duration-based scoring (lower weight since many videos are short)
      if (duration <= 60)
        shortsScore += 3; // Traditional Shorts
      else if (duration <= 180) shortsScore += 1; // Extended Shorts

      // Return true if we have strong indicators
      return shortsScore >= 4;
    }

    // 2. For videos longer than 3 minutes, check for explicit Shorts indicators
    const hasShortsUrl =
      videoId &&
      (description.includes(`youtube.com/shorts/${videoId}`) ||
        description.includes(`youtu.be/shorts/${videoId}`));

    const isFromShortsPlaylist = snippet.playlistId?.startsWith("UUSH");
    const hasShortsFlag = snippet.shortVideo === true;

    // If we have strong indicators even for longer videos, it might be a Short
    if (isFromShortsPlaylist || hasShortsFlag || hasShortsUrl) {
      return true;
    }

    // If we're not sure, default to false to avoid false positives
    return false;
  }

  /**
   * Check if thumbnail suggests vertical aspect ratio
   */
  private isVerticalThumbnail(thumbnails: any): boolean {
    if (!thumbnails) return false;

    // Check if we have a high-quality thumbnail
    const thumbnail = thumbnails.maxres || thumbnails.high || thumbnails.medium;
    if (!thumbnail) return false;

    // If width and height are available, check aspect ratio
    if (thumbnail.width && thumbnail.height) {
      const aspectRatio = thumbnail.width / thumbnail.height;
      // Vertical aspect ratio is typically 9:16 (0.5625) or 1:1 (1.0)
      return aspectRatio <= 1.0;
    }

    return false;
  }

  /**
   * Check if a channel is primarily focused on Shorts content
   * @param channelId The channel ID to check
   * @returns True if the channel is a Shorts channel
   */
  private isShortsChannel(_channelId: string): boolean {
    // For now, return false as we'd need to analyze the channel's content
    // This could be enhanced by checking channel's recent videos
    return false;
  }

  /**
   * Map YouTube API video item to our Shorts DTO
   * @param item Video item from YouTube API
   * @returns Mapped ShortsMetricsDto
   */
  private mapShortsItem(item: any): ShortsMetricsDto {
    if (!item || !item.id) {
      throw new Error("Invalid video item provided");
    }

    const stats = item.statistics || {};
    const snippet = item.snippet || {};
    const contentDetails = item.contentDetails || {};

    // Calculate engagement metrics
    const viewCount = parseInt(stats.viewCount) || 0;
    const likeCount = parseInt(stats.likeCount) || 0;
    const commentCount = parseInt(stats.commentCount) || 0;
    const engagementRate =
      viewCount > 0 ? ((likeCount + commentCount) / viewCount) * 100 : 0;

    // Calculate duration in seconds
    let duration = 0;
    if (contentDetails.duration) {
      const match = contentDetails.duration.match(
        /PT(?:([0-9]*)H)?(?:([0-9]*)M)?(?:([0-9]*)S)?/,
      );
      if (match) {
        const hours = parseInt(match[1] || "0", 10);
        const minutes = parseInt(match[2] || "0", 10);
        const seconds = parseInt(match[3] || "0", 10);
        duration = hours * 3600 + minutes * 60 + seconds;
      }
    }

    // Get the highest resolution thumbnail available
    const thumbnails = snippet.thumbnails || {};
    const thumbnailUrl =
      thumbnails.maxres?.url ||
      thumbnails.high?.url ||
      thumbnails.medium?.url ||
      thumbnails.default?.url ||
      "";

    return {
      videoId: item.id.videoId || item.id,
      title: snippet.title || "Untitled",
      description: snippet.description || "",
      viewCount,
      likeCount,
      commentCount,
      engagementRate: parseFloat(engagementRate.toFixed(2)),
      publishedAt: snippet.publishedAt || new Date().toISOString(),
      thumbnail: thumbnailUrl,
      duration,
      channelId: snippet.channelId || "",
      channelTitle: snippet.channelTitle || "Unknown Channel",
      url: `https://youtube.com/watch?v=${item.id.videoId || item.id}`,
      isShorts: this.isShortsVideo(item),
      viewToLikeRatio:
        likeCount > 0 ? parseFloat((viewCount / likeCount).toFixed(2)) : 0,
    };
  }

  /**
   * Comprehensive method to get YouTube Shorts using multiple strategies
   * This provides better coverage than relying solely on trending
   */
  async getComprehensiveShorts(
    userId: string,
    maxResults: number = 50,
    options: {
      regionCode?: string;
      categoryId?: string;
      timeRange?: string;
      minViews?: number;
      useSearch?: boolean;
      useTrending?: boolean;
      usePlaylists?: boolean;
      niche?: string;
    } = {},
  ): Promise<ShortsMetricsDto[]> {
    // Ensure maxResults is a valid number
    const validMaxResults = Math.max(1, Math.min(100, maxResults || 50));

    const {
      regionCode = "US",
      timeRange = "week",
      minViews = 1000,
      useSearch = true,
      useTrending = true,
      usePlaylists = true,
      niche,
    } = options;

    // Use exact time range with tolerance
    const targetDate = this.getTargetDate(timeRange);
    const toleranceHours = this.getToleranceHours(timeRange);
    const startDate = new Date(
      targetDate.getTime() - toleranceHours * 60 * 60 * 1000,
    );
    const endDate = new Date(
      targetDate.getTime() + toleranceHours * 60 * 60 * 1000,
    );

    this.logger.log(`Getting comprehensive Shorts with strategies:`, {
      search: useSearch,
      trending: useTrending,
      playlists: usePlaylists,
      maxResults: validMaxResults,
      regionCode,
      timeRange,
      targetDate: targetDate.toISOString(),
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      toleranceHours,
    });

    const allShorts: ShortsMetricsDto[] = [];
    const seenVideoIds = new Set<string>();

    // Strategy 1: Search for Shorts (most reliable for finding Shorts)
    if (useSearch) {
      try {
        this.logger.log("Strategy 1: Searching for Shorts...");
        const searchKeywords = niche
          ? await this.buildComprehensiveSearchKeywords(niche)
          : [
              "shorts",
              "short video",
              "trending shorts",
              "viral shorts",
              "popular shorts",
              "#shorts",
              "trending",
              "viral",
            ];

        for (const keyword of searchKeywords) {
          const searchShorts = await this.searchShortsByKeyword(
            userId,
            keyword,
            Math.min(Math.floor(validMaxResults / 2), 25),
            {
              sortBy: "viewCount",
              regionCode,
              publishedAfter: startDate.toISOString(),
            },
          );

          // Filter results by end date since searchShortsByKeyword doesn't support publishedBefore
          const filteredShorts = searchShorts.filter((short) => {
            const publishedAt = new Date(short.publishedAt);
            return publishedAt <= endDate;
          });

          for (const short of filteredShorts) {
            if (
              !seenVideoIds.has(short.videoId) &&
              short.viewCount >= minViews
            ) {
              allShorts.push(short);
              seenVideoIds.add(short.videoId);
            }
          }

          // Add small delay to avoid rate limiting
          await new Promise((resolve) => setTimeout(resolve, 100));
        }

        this.logger.log(
          `Search strategy found ${allShorts.length} unique Shorts`,
        );

        // If niche search failed, try broader search but still respect the niche
        if (niche && allShorts.length === 0) {
          this.logger.log(
            `Niche search failed for "${niche}", trying broader niche-aware search...`,
          );
          try {
            // Try different combinations that still include the niche
            const broaderNicheKeywords = [
              `${niche} trending`,
              `${niche} popular`,
              `${niche} viral`,
              `trending ${niche}`,
              `popular ${niche}`,
              `viral ${niche}`,
              `#${niche}`,
              niche, // Just the niche name itself
            ];

            for (const keyword of broaderNicheKeywords) {
              const searchShorts = await this.searchShortsByKeyword(
                userId,
                keyword,
                Math.min(Math.floor(validMaxResults / 2), 25),
                {
                  sortBy: "viewCount",
                  regionCode,
                  publishedAfter: startDate.toISOString(),
                },
              );

              // Filter results by end date
              const filteredShorts = searchShorts.filter((short) => {
                const publishedAt = new Date(short.publishedAt);
                return publishedAt <= endDate;
              });

              for (const short of filteredShorts) {
                if (
                  !seenVideoIds.has(short.videoId) &&
                  short.viewCount >= minViews
                ) {
                  allShorts.push(short);
                  seenVideoIds.add(short.videoId);
                }
              }

              await new Promise((resolve) => setTimeout(resolve, 100));
            }

            this.logger.log(
              `Broader niche-aware search found ${allShorts.length} additional Shorts`,
            );

            // If still no results, try one final broader search but filter results by niche
            if (allShorts.length === 0) {
              this.logger.log(
                `Still no results for "${niche}", trying general search with niche filtering...`,
              );

              const generalKeywords = [
                "shorts",
                "trending shorts",
                "viral shorts",
                "popular shorts",
              ];

              for (const keyword of generalKeywords) {
                const searchShorts = await this.searchShortsByKeyword(
                  userId,
                  keyword,
                  Math.min(Math.floor(validMaxResults * 2), 50), // Get more to filter
                  {
                    sortBy: "viewCount",
                    regionCode,
                    publishedAfter: startDate.toISOString(),
                  },
                );

                // Filter results by end date
                const filteredShorts = searchShorts.filter((short) => {
                  const publishedAt = new Date(short.publishedAt);
                  return publishedAt <= endDate;
                });

                // Filter results to include only videos that mention the niche
                const nicheFilteredShorts = filteredShorts.filter((short) => {
                  const title = short.title.toLowerCase();
                  const description = (short.description || "").toLowerCase();
                  const nicheLower = niche.toLowerCase();

                  return (
                    title.includes(nicheLower) ||
                    description.includes(nicheLower)
                  );
                });

                for (const short of nicheFilteredShorts) {
                  if (
                    !seenVideoIds.has(short.videoId) &&
                    short.viewCount >= minViews
                  ) {
                    allShorts.push(short);
                    seenVideoIds.add(short.videoId);
                  }
                }

                await new Promise((resolve) => setTimeout(resolve, 100));
              }

              this.logger.log(
                `General search with niche filtering found ${allShorts.length} Shorts`,
              );
            }
          } catch (error) {
            this.logger.error("Broader search strategy failed:", error.message);
          }
        }
      } catch (error) {
        this.logger.error("Search strategy failed:", error.message);
        this.logger.error("Error searching for Shorts by keyword:", error);
      }
    }

    // Strategy 2: Trending videos filtered for Shorts
    if (useTrending && allShorts.length < validMaxResults) {
      try {
        this.logger.log(
          "Strategy 2: Getting trending videos and filtering for Shorts...",
        );
        // Remove getTrendingVideos call - skip this strategy for now
        this.logger.warn(
          "getTrendingVideos method removed - skipping trending strategy",
        );
      } catch (error) {
        this.logger.error("Trending strategy failed:", error.message);
      }
    }

    // Strategy 3: Popular channels' Shorts playlists
    if (usePlaylists && allShorts.length < validMaxResults) {
      try {
        this.logger.log("Strategy 3: Getting Shorts from popular channels...");
        const popularChannelIds = await this.getPopularChannelIds(
          userId,
          regionCode,
        );

        for (const channelId of popularChannelIds.slice(0, 10)) {
          try {
            const channelShorts = await this.getChannelShorts(
              userId,
              channelId,
              Math.min(Math.floor(maxResults / 5), 10),
            );

            for (const short of channelShorts.shorts) {
              if (
                !seenVideoIds.has(short.videoId) &&
                short.viewCount >= minViews
              ) {
                allShorts.push(short);
                seenVideoIds.add(short.videoId);
              }
            }

            // Add delay to avoid rate limiting
            await new Promise((resolve) => setTimeout(resolve, 200));
          } catch (error) {
            this.logger.warn(
              `Failed to get Shorts for channel ${channelId}:`,
              error.message,
            );
            continue;
          }
        }

        this.logger.log(
          `Playlist strategy found Shorts from ${popularChannelIds.length} channels`,
        );
      } catch (error) {
        this.logger.error("Playlist strategy failed:", error.message);
      }
    }

    // Strategy 4: Search by specific niches that tend to have Shorts
    if (allShorts.length < validMaxResults) {
      try {
        this.logger.log("Strategy 4: Searching by Shorts-friendly niches...");
        const shortsNiches = niche
          ? [`${niche} shorts`, `${niche} short video`, `trending ${niche}`]
          : [
              "comedy shorts",
              "dance shorts",
              "food shorts",
              "fitness shorts",
              "beauty shorts",
              "gaming shorts",
              "life hacks",
              "quick tips",
            ];

        for (const nicheKeyword of shortsNiches) {
          const nicheShorts = await this.searchShortsByKeyword(
            userId,
            nicheKeyword,
            Math.min(Math.floor(maxResults / 8), 5),
            {
              sortBy: "viewCount",
              regionCode,
              publishedAfter: startDate.toISOString(),
            },
          );

          // Filter results by end date
          const filteredNicheShorts = nicheShorts.filter((short) => {
            const publishedAt = new Date(short.publishedAt);
            return publishedAt <= endDate;
          });

          for (const short of filteredNicheShorts) {
            if (
              !seenVideoIds.has(short.videoId) &&
              short.viewCount >= minViews
            ) {
              allShorts.push(short);
              seenVideoIds.add(short.videoId);
            }
          }

          await new Promise((resolve) => setTimeout(resolve, 100));
        }

        this.logger.log(`Niche search strategy completed`);
      } catch (error) {
        this.logger.error("Niche search strategy failed:", error.message);
      }
    }

    // Sort by view count and return requested number
    const sortedShorts = allShorts
      .sort((a, b) => b.viewCount - a.viewCount)
      .slice(0, validMaxResults);

    this.logger.log(
      `Comprehensive Shorts collection completed: ${sortedShorts.length} Shorts found`,
    );

    // Log details of found shorts
    if (sortedShorts.length > 0) {
      this.logger.log("Found Shorts details:");
      sortedShorts.slice(0, 5).forEach((short, index) => {
        this.logger.log(
          `  ${index + 1}. ${short.title} (${short.videoId}) - ${short.viewCount} views`,
        );
      });
      if (sortedShorts.length > 5) {
        this.logger.log(`  ... and ${sortedShorts.length - 5} more`);
      }
    }

    // Return filtered Shorts up to maxResults
    return sortedShorts.slice(0, validMaxResults);
  }

  /**
   * Get popular channel IDs for Shorts discovery
   */
  private async getPopularChannelIds(
    userId: string,
    regionCode: string,
  ): Promise<string[]> {
    try {
      const youtube = await this.getAuthenticatedYoutube(userId);

      // Search for popular channels
      const searchResponse = await youtube.search.list({
        part: ["snippet"],
        type: ["channel"],
        order: "viewCount",
        maxResults: 20,
        regionCode,
        publishedAfter: new Date(
          Date.now() - 30 * 24 * 60 * 60 * 1000,
        ).toISOString(), // Last 30 days
      });

      // Record quota usage
      await this.quotaMonitorService.recordQuotaUsage('search', 100);

      const channelIds =
        searchResponse.data.items
          ?.filter((item) => item.snippet?.channelId)
          ?.map((item) => item.snippet.channelId) || [];

      return channelIds;
    } catch (error) {
      this.logger.error("Failed to get popular channel IDs:", error.message);
      return [];
    }
  }

  /**
   * Get channel subscriber count from YouTube API
   */
  async getChannelSubscriberCount(
    userId: string,
    channelId: string,
  ): Promise<number> {
    try {
      const youtube = await this.getAuthenticatedYoutube(userId);

      const response = await youtube.channels.list({
        part: ["statistics"],
        id: [channelId],
      });

      const channel = response.data.items?.[0];
      if (channel?.statistics?.subscriberCount) {
        return parseInt(channel.statistics.subscriberCount);
      }

      return 0;
    } catch (error) {
      this.logger.warn(
        `Failed to get subscriber count for channel ${channelId}:`,
        error.message,
      );
      return 0;
    }
  }

  /**
   * Get subscriber counts for multiple channels (batch request)
   */
  async getChannelSubscriberCounts(
    userId: string,
    channelIds: string[],
  ): Promise<Map<string, number>> {
    const subscriberCounts = new Map<string, number>();

    try {
      const youtube = await this.getAuthenticatedYoutube(userId);

      // Process in batches of 50 (YouTube API limit)
      const batchSize = 50;
      for (let i = 0; i < channelIds.length; i += batchSize) {
        const batch = channelIds.slice(i, i + batchSize);

        const response = await youtube.channels.list({
          part: ["statistics"],
          id: batch,
        });

        response.data.items?.forEach((channel) => {
          if (channel.id && channel.statistics?.subscriberCount) {
            subscriberCounts.set(
              channel.id,
              parseInt(channel.statistics.subscriberCount),
            );
          }
        });

        // Add delay to avoid rate limiting
        if (i + batchSize < channelIds.length) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }
    } catch (error) {
      this.logger.warn(
        `Failed to get subscriber counts for channels:`,
        error.message,
      );
    }

    return subscriberCounts;
  }

  /**
   * Helper methods for exact time range calculation
   */
  private getTargetDate(timeRange: string): Date {
    const now = new Date();

    switch (timeRange.toLowerCase()) {
      case "day":
      case "24h":
        // Exactly 24 hours ago
        return new Date(now.getTime() - 24 * 60 * 60 * 1000);
      case "week":
      case "7d":
        // Exactly 7 days ago
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      case "month":
      case "30d":
        // Exactly 30 days ago
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      default:
        // Default to 24 hours ago
        return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }
  }

  private getToleranceHours(timeRange: string): number {
    switch (timeRange.toLowerCase()) {
      case "day":
      case "24h":
        return 2; // ±2 hours for day
      case "week":
      case "7d":
        return 48; // ±2 days for week
      case "month":
      case "30d":
        return 72; // ±3 days for month
      default:
        return 2; // Default tolerance
    }
  }
}
