import { Injectable, Logger, BadRequestException, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError } from 'axios';
import { ProfileInfo, VideoInfo, PerformanceMetrics, BestPostingTimes, AudienceDemographics } from '../interfaces/profile-scout.interface';
import { YouTubeChannelResolverService, ChannelResolutionResult } from '../../../youtube/services/youtube-channel-resolver.service';
import { AudienceDemographicsService } from './audience-demographics.service';
import { SmartDemographicsService } from './smart-demographics.service';

// Interface for YouTube comments
interface YouTubeComment {
  text: string;
  author: string;
  publishedAt: string;
  likeCount: number;
  replyCount: number;
  authorChannelId?: string;
  authorChannelUrl?: string;
}

@Injectable()
export class YouTubeProfileService {
  private readonly logger = new Logger(YouTubeProfileService.name);
  private readonly apiKey: string;
  private readonly maxRetries = 3;
  private readonly retryDelay = 1000; // 1 second

  constructor(
    private readonly configService: ConfigService,
    private readonly channelResolver: YouTubeChannelResolverService,
    private readonly audienceDemographicsService: AudienceDemographicsService,
    private readonly smartDemographicsService: SmartDemographicsService,
  ) {
    this.apiKey = this.configService.get<string>('YOUTUBE_API_KEY');
    if (!this.apiKey) {
      this.logger.warn('YouTube API key not found in configuration');
    }
  }

  /**
   * Get channel information by username, channel ID, or custom URL
   */
  async getChannelByUsername(identifier: string): Promise<ProfileInfo> {
    try {
      this.logger.log(`Fetching YouTube channel info for: ${identifier}`);

      // Use the channel resolver service for robust channel resolution
      const channelData = await this.channelResolver.resolveChannel(identifier);

      return {
        username: channelData.username || identifier,
        displayName: channelData.title,
        bio: channelData.description,
        profilePictureUrl: channelData.thumbnailUrl,
        followerCount: channelData.subscriberCount,
        followingCount: 0, // YouTube doesn't provide following count in API
        totalLikes: 0, // Will be calculated from videos
        totalVideos: channelData.videoCount,
        region: channelData.country || 'Unknown',
        isVerified: channelData.verified,
      };
    } catch (error) {
      this.logger.error(`Error fetching YouTube channel info: ${error.message}`);
      throw this.handleYouTubeError(error);
    }
  }

  /**
   * Get recent videos from a channel
   */
  async getRecentVideos(channelId: string, maxVideos: number = 50): Promise<VideoInfo[]> {
    try {
      this.logger.log(`Fetching ${maxVideos} recent videos for channel: ${channelId}`);

      // Get channel's uploads playlist
      const channelResponse = await this.makeYouTubeRequest('channels', {
        part: 'contentDetails',
        id: channelId,
      });

      if (!channelResponse.data.items || channelResponse.data.items.length === 0) {
        throw new BadRequestException(`Channel not found: ${channelId}`);
      }

      const uploadsPlaylistId = channelResponse.data.items[0].contentDetails.relatedPlaylists.uploads;

      // Get videos from uploads playlist
      const playlistResponse = await this.makeYouTubeRequest('playlistItems', {
        part: 'snippet',
        playlistId: uploadsPlaylistId,
        maxResults: maxVideos,
      });

      if (!playlistResponse.data.items || playlistResponse.data.items.length === 0) {
        this.logger.warn(`No videos found for channel: ${channelId}`);
        return [];
      }

      const videoIds = playlistResponse.data.items.map((item: any) => item.snippet.resourceId.videoId);

      // Get detailed video information
      const videosResponse = await this.makeYouTubeRequest('videos', {
        part: 'snippet,statistics,contentDetails',
        id: videoIds.join(','),
      });

      return videosResponse.data.items.map((video: any) => this.mapVideoData(video));
    } catch (error) {
      this.logger.error(`Error fetching YouTube videos: ${error.message}`);
      throw this.handleYouTubeError(error);
    }
  }

  /**
   * Calculate performance metrics from videos
   */
  calculatePerformanceMetrics(videos: VideoInfo[]): PerformanceMetrics {
    if (videos.length === 0) {
      return {
        totalViews: 0,
        totalLikes: 0,
        totalComments: 0,
        totalShares: 0,
        averageEngagementRate: 0,
        averageViralityScore: 0,
        videosAnalyzed: 0,
      };
    }

    const totalViews = videos.reduce((sum, video) => sum + video.views, 0);
    const totalLikes = videos.reduce((sum, video) => sum + video.likes, 0);
    const totalComments = videos.reduce((sum, video) => sum + video.comments, 0);
    const totalShares = videos.reduce((sum, video) => sum + video.shares, 0);
    const averageEngagementRate = videos.reduce((sum, video) => sum + video.engagementRate, 0) / videos.length;
    const averageViralityScore = videos.reduce((sum, video) => sum + video.viralityScore, 0) / videos.length;

    return {
      totalViews,
      totalLikes,
      totalComments,
      totalShares,
      averageEngagementRate,
      averageViralityScore,
      videosAnalyzed: videos.length,
    };
  }

  /**
   * Calculate best posting times
   */
  calculateBestPostingTimes(videos: VideoInfo[]): BestPostingTimes {
    if (videos.length === 0) {
      return {
        topTimes: [],
        weeklyFrequency: '0 posts',
        pattern: 'No Data',
        analysisPeriod: 0,
      };
    }


    const postingTimes: Map<string, { performance: number; frequency: number }> = new Map();

    videos.forEach(video => {
      const date = new Date(video.publishedAt);
      const day = date.toLocaleDateString('en-US', { weekday: 'long' });
      const hour = date.getHours();
      const timeSlot = `${hour}:00-${hour + 1}:00`;
      const key = `${day} ${timeSlot}`;

      if (!postingTimes.has(key)) {
        postingTimes.set(key, { performance: 0, frequency: 0 });
      }

      const current = postingTimes.get(key)!;
      current.performance += video.views;
      current.frequency += 1;
    });

    const topTimes = Array.from(postingTimes.entries())
      .map(([time, stats]) => ({
        time: time.split(' ')[1],
        day: time.split(' ')[0],
        performance: stats.performance / stats.frequency,
        frequency: stats.frequency,
      }))
      .sort((a, b) => b.performance - a.performance)
      .slice(0, 3);

    // Calculate posting frequency and analysis period
    const sortedVideos = videos.sort((a, b) => new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime());
    const firstVideo = new Date(sortedVideos[0].publishedAt);
    const lastVideo = new Date(sortedVideos[sortedVideos.length - 1].publishedAt);
    const daysDiff = Math.max(1, (lastVideo.getTime() - firstVideo.getTime()) / (1000 * 60 * 60 * 24));
    const weeklyFrequency = daysDiff > 0 ? (videos.length / (daysDiff / 7)).toFixed(1) : videos.length.toString();

    return {
      topTimes,
      weeklyFrequency: `${weeklyFrequency} posts`,
      pattern: this.getPostingPattern(parseFloat(weeklyFrequency)),
      analysisPeriod: Math.round(daysDiff), // Days between oldest and newest video
    };
  }

  /**
   * Get audience demographics using the new demographics service
   * DISABLED: Audience demographics data is unreliable and misleading for small channels
   */
  async getAudienceDemographics(channelId: string, userId?: string): Promise<AudienceDemographics> {
    // Commented out due to erroneous data - shows thousands of viewers for channels with only 8 views
    // This creates misleading analytics that don't match actual channel performance
    this.logger.warn(`Audience demographics disabled for channel ${channelId} - data is unreliable`);

    return {
      countries: [],
      totalAudience: 0,
    };

    /* ORIGINAL CODE - COMMENTED OUT DUE TO ERRONEOUS DATA
    try {
      // Use the new demographics service for production-ready data
      const demographicsData = await this.audienceDemographicsService.getAudienceDemographics(
        'youtube',
        channelId,
        undefined, // username
        undefined, // followerCount
        userId
      );

      // Convert to the expected format
      return {
        countries: demographicsData.countries.map(country => ({
          country: country.country,
          percentage: country.percentage,
          count: country.count,
        })),
        totalAudience: demographicsData.totalAudience,
      };
    } catch (error) {
      this.logger.warn(`Failed to get demographics for channel ${channelId}:`, error.message);

      // Fallback to basic estimation
      return this.getFallbackDemographics();
    }
    */
  }

  /**
   * Fallback demographics when the service fails
   */
  private getFallbackDemographics(): AudienceDemographics {
    return {
      countries: [
        { country: 'United States', percentage: 25.0, count: 25000000 },
        { country: 'India', percentage: 15.0, count: 15000000 },
        { country: 'Brazil', percentage: 10.0, count: 10000000 },
      ],
      totalAudience: 100000000,
    };
  }

  /**
   * Map YouTube API video data to our interface
   */
  private mapVideoData(video: any): VideoInfo {
    const snippet = video.snippet;
    const statistics = video.statistics;
    const contentDetails = video.contentDetails;

    // Calculate engagement rate
    const views = parseInt(statistics.viewCount) || 0;
    const likes = parseInt(statistics.likeCount) || 0;
    const comments = parseInt(statistics.commentCount) || 0;
    const engagementRate = views > 0 ? ((likes + comments) / views) * 100 : 0;

    // Calculate virality score (simplified version)
    const viralityScore = this.calculateViralityScore(views, likes, comments, new Date(snippet.publishedAt));

    // Parse duration
    const duration = this.parseDuration(contentDetails.duration);

    // Extract hashtags from description
    const hashtags = (snippet.description.match(/#\w+/g) || []).map((tag: string) => tag.toLowerCase());

    return {
      videoId: video.id,
      title: snippet.title,
      description: snippet.description,
      thumbnailUrl: snippet.thumbnails?.high?.url || snippet.thumbnails?.medium?.url,
      views,
      likes,
      comments,
      shares: 0, // YouTube doesn't provide share count in basic API
      engagementRate,
      viralityScore,
      duration,
      url: `https://www.youtube.com/watch?v=${video.id}`,
      publishedAt: snippet.publishedAt,
      hashtags,
    };
  }

  /**
   * Calculate virality score (0-100) - Fixed calculation
   */
  private calculateViralityScore(views: number, likes: number, comments: number, publishedAt: Date): number {
    const ageInHours = Math.max(1, (new Date().getTime() - publishedAt.getTime()) / (1000 * 60 * 60));
    const ageInDays = ageInHours / 24;

    // Calculate engagement rate (likes + comments) / views
    const engagementRate = views > 0 ? (likes + comments) / views : 0;

    // Calculate view velocity (views per hour)
    const viewVelocity = views / ageInHours;

    // Calculate recency factor (newer videos get higher scores)
    const recencyFactor = Math.max(0.1, 1 - (ageInDays / 30)); // Decay over 30 days

    // Calculate engagement score (0-50 points)
    const engagementScore = Math.min(50, engagementRate * 10000); // Scale engagement rate

    // Calculate velocity score (0-30 points) - normalize for typical YouTube performance
    const velocityScore = Math.min(30, Math.log10(viewVelocity + 1) * 10);

    // Calculate recency score (0-20 points)
    const recencyScore = recencyFactor * 20;

    // Total score (0-100)
    const totalScore = engagementScore + velocityScore + recencyScore;

    return Math.round(Math.min(100, Math.max(0, totalScore)));
  }

  /**
   * Parse ISO 8601 duration to seconds
   */
  private parseDuration(duration: string): number {
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;

    const hours = parseInt(match[1] || '0');
    const minutes = parseInt(match[2] || '0');
    const seconds = parseInt(match[3] || '0');

    return hours * 3600 + minutes * 60 + seconds;
  }

  /**
   * Get posting pattern description
   */
  private getPostingPattern(weeklyFrequency: number): string {
    if (weeklyFrequency >= 7) return 'Very High';
    if (weeklyFrequency >= 3) return 'High';
    if (weeklyFrequency >= 1) return 'Medium';
    if (weeklyFrequency >= 0.5) return 'Low';
    return 'Very Low';
  }

  /**
   * Make a YouTube API request with retry logic and error handling
   */
  private async makeYouTubeRequest(endpoint: string, params: any, retryCount = 0): Promise<any> {
    try {
      const response = await axios.get(`https://www.googleapis.com/youtube/v3/${endpoint}`, {
        params: {
          ...params,
          key: this.apiKey,
        },
        timeout: 10000, // 10 second timeout
      });

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
            if (data.error.message?.includes('quota')) {
              return new InternalServerErrorException({
                message: 'YouTube API quota exceeded',
                details: 'Please check your API quota or upgrade your plan',
                code: 'QUOTA_EXCEEDED'
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
            message: 'Resource not found',
            details: 'The requested YouTube resource could not be found',
            code: 'RESOURCE_NOT_FOUND'
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
    if (error instanceof BadRequestException || error instanceof InternalServerErrorException || error instanceof NotFoundException) {
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
      message: 'Failed to process YouTube request',
      details: error.message,
      code: 'UNKNOWN_ERROR'
    });
  }

  /**
   * Fetch comments for a specific YouTube video
   */
  async fetchVideoComments(videoId: string, maxComments: number = 100): Promise<YouTubeComment[]> {
    try {
      this.logger.log(`Fetching comments for video: ${videoId} (max: ${maxComments})`);

      if (!this.apiKey) {
        this.logger.warn('YouTube API key not available - cannot fetch comments');
        return [];
      }

      // Fetch comment threads (top-level comments)
      const commentThreadsResponse = await this.makeYouTubeRequest('commentThreads', {
        part: 'snippet,replies',
        videoId: videoId,
        maxResults: Math.min(maxComments, 100), // YouTube API limit is 100 per request
        order: 'time', // Get most recent comments first
        textFormat: 'plainText'
      });

      if (!commentThreadsResponse.data.items || commentThreadsResponse.data.items.length === 0) {
        this.logger.log(`No comments found for video: ${videoId}`);
        return [];
      }

      const comments: YouTubeComment[] = [];

      for (const thread of commentThreadsResponse.data.items) {
        const topLevelComment = thread.snippet.topLevelComment.snippet;

        // Add top-level comment
        comments.push({
          text: topLevelComment.textDisplay,
          author: topLevelComment.authorDisplayName,
          publishedAt: topLevelComment.publishedAt,
          likeCount: topLevelComment.likeCount || 0,
          replyCount: thread.snippet.totalReplyCount || 0,
          authorChannelId: topLevelComment.authorChannelId?.value,
          authorChannelUrl: topLevelComment.authorChannelUrl
        });

        // Add replies if available and we haven't reached the limit
        if (thread.replies && comments.length < maxComments) {
          for (const reply of thread.replies.comments.slice(0, Math.min(3, maxComments - comments.length))) {
            const replySnippet = reply.snippet;
            comments.push({
              text: replySnippet.textDisplay,
              author: replySnippet.authorDisplayName,
              publishedAt: replySnippet.publishedAt,
              likeCount: replySnippet.likeCount || 0,
              replyCount: 0, // Replies don't have sub-replies
              authorChannelId: replySnippet.authorChannelId?.value,
              authorChannelUrl: replySnippet.authorChannelUrl
            });
          }
        }
      }

      this.logger.log(`Successfully fetched ${comments.length} comments for video: ${videoId}`);
      return comments.slice(0, maxComments); // Ensure we don't exceed the limit

    } catch (error) {
      this.logger.error(`Error fetching comments for video ${videoId}: ${error.message}`);

      // Don't throw error for comment fetching failures - return empty array
      // This ensures the main functionality continues even if comments fail
      return [];
    }
  }

  /**
   * Fetch comments for multiple videos (batch processing)
   */
  async fetchMultipleVideoComments(videos: VideoInfo[], maxCommentsPerVideo: number = 50): Promise<{ [videoId: string]: YouTubeComment[] }> {
    try {
      this.logger.log(`Fetching comments for ${videos.length} videos (max ${maxCommentsPerVideo} per video)`);

      const commentsByVideo: { [videoId: string]: YouTubeComment[] } = {};

      // Process videos in batches to avoid rate limiting
      const batchSize = 5; // Process 5 videos at a time
      for (let i = 0; i < videos.length; i += batchSize) {
        const batch = videos.slice(i, i + batchSize);

        const batchPromises = batch.map(async (video) => {
          try {
            const comments = await this.fetchVideoComments(video.videoId, maxCommentsPerVideo);
            commentsByVideo[video.videoId] = comments;

            // Add small delay between requests to respect rate limits
            await new Promise(resolve => setTimeout(resolve, 200));
          } catch (error) {
            this.logger.warn(`Failed to fetch comments for video ${video.videoId}: ${error.message}`);
            commentsByVideo[video.videoId] = [];
          }
        });

        await Promise.all(batchPromises);

        // Add delay between batches
        if (i + batchSize < videos.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      const totalComments = Object.values(commentsByVideo).reduce((sum, comments) => sum + comments.length, 0);
      this.logger.log(`Successfully fetched ${totalComments} total comments across ${videos.length} videos`);

      return commentsByVideo;

    } catch (error) {
      this.logger.error(`Error in batch comment fetching: ${error.message}`);
      return {};
    }
  }

  /**
   * Get audience demographics with comment analysis for YouTube
   */
  async getAudienceDemographicsWithComments(
    channelId: string,
    videos: VideoInfo[],
    followerCount?: number
  ): Promise<AudienceDemographics> {
    try {
      this.logger.log(`Getting enhanced demographics for YouTube channel: ${channelId}`);

      // Fetch comments from top-performing videos (first 5 videos)
      const topVideos = videos.slice(0, 5);
      const commentsByVideo = await this.fetchMultipleVideoComments(topVideos, 30); // 30 comments per video

      // Flatten all comments into a single array
      const allComments = Object.values(commentsByVideo).flat();

      this.logger.log(`Analyzing ${allComments.length} comments for demographic inference`);

      // Use the smart demographics service with comments
      const demographicInference = await this.smartDemographicsService.inferDemographicsWithComments(
        videos,
        channelId,
        allComments.map(comment => ({
          text: comment.text,
          author: comment.author,
          publishedAt: comment.publishedAt,
          likeCount: comment.likeCount,
          replyCount: comment.replyCount
        }))
      );

      return {
        countries: demographicInference.countries.map(country => ({
          country: country.country,
          percentage: country.percentage,
          count: Math.round((followerCount || 1000000) * (country.percentage / 100))
        })),
        totalAudience: followerCount || 1000000,
        ageGroups: demographicInference.ageGroups,
        gender: demographicInference.gender,
        confidence: demographicInference.confidence,
        signalContributions: demographicInference.signals,
        note: `Enhanced demographics from ${videos.length} videos and ${allComments.length} comments with ${demographicInference.confidence}% confidence`,
        dataSource: demographicInference.dataSource,
      };

    } catch (error) {
      this.logger.error(`Error getting enhanced demographics: ${error.message}`);

      // Fallback to basic demographics without comments
      return this.getFallbackDemographics();
    }
  }

  /**
   * Utility function for delays
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
