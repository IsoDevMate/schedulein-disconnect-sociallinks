import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export interface ManagementToken {
  platform: string;
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  scope: string;
  userId: string;
}

export interface ContentMetrics {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  engagementRate: number;
}

export interface ContentItem {
  id: string;
  title: string;
  description?: string;
  url: string;
  thumbnailUrl?: string;
  publishedAt: Date;
  metrics: ContentMetrics;
}

@Injectable()
export class ManagementService {
  private readonly logger = new Logger(ManagementService.name);

  constructor(private readonly configService: ConfigService) {}

  // ===== TIKTOK MANAGEMENT =====

  /**
   * Get TikTok user videos with analytics and dashboard metrics
   */
  async getTikTokVideos(accessToken: string, limit: number = 20): Promise<ContentItem[]> {
    try {
      this.logger.log('Fetching TikTok videos...');

      // Get user info first
      const userInfo = await this.getTikTokUserInfo(accessToken);

      // Get videos list
      const videosResponse = await axios.get(
        'https://open.tiktokapis.com/v2/video/list/',
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          params: {
            fields: ['id', 'title', 'description', 'cover_image_url', 'video_url', 'create_time', 'stats'],
            max_count: limit,
          },
        }
      );

      const videos = videosResponse.data.data.videos || [];

      // Calculate dashboard metrics
      const totalViews = videos.reduce((sum, video) => sum + (video.stats?.play_count || 0), 0);
      const totalLikes = videos.reduce((sum, video) => sum + (video.stats?.digg_count || 0), 0);
      const totalComments = videos.reduce((sum, video) => sum + (video.stats?.comment_count || 0), 0);
      const totalShares = videos.reduce((sum, video) => sum + (video.stats?.share_count || 0), 0);

      // Calculate posting frequency (videos this week)
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
      const videosThisWeek = videos.filter(video =>
        new Date(video.create_time * 1000) > oneWeekAgo
      ).length;

      // Calculate overall engagement rate
      const overallEngagementRate = totalViews > 0
        ? Math.round(((totalLikes + totalComments + totalShares) / totalViews) * 100 * 100) / 100
        : 0;

      // Add dashboard metrics to user info
      userInfo.totalViews = totalViews;
      userInfo.engagementRate = overallEngagementRate;
      userInfo.postingFrequency = videosThisWeek;

      return videos.map((video: any) => ({
        id: video.id,
        title: video.title || video.description || 'TikTok Video',
        description: video.description,
        url: `https://www.tiktok.com/@${userInfo.username}/video/${video.id}`,
        thumbnailUrl: video.cover_image_url,
        publishedAt: new Date(video.create_time * 1000),
        metrics: {
          views: video.stats?.play_count || 0,
          likes: video.stats?.digg_count || 0,
          comments: video.stats?.comment_count || 0,
          shares: video.stats?.share_count || 0,
          engagementRate: this.calculateEngagementRate(video.stats),
        },
      }));
    } catch (error) {
      this.logger.error('Failed to fetch TikTok videos:', error);
      throw new Error('Failed to fetch TikTok videos');
    }
  }

  /**
   * Get TikTok user info with comprehensive data
   */
  async getTikTokUserInfo(accessToken: string): Promise<any> {
    try {
      const response = await axios.get(
        'https://open.tiktokapis.com/v2/user/info/',
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          params: {
            fields: [
              'open_id', 'union_id', 'avatar_url', 'avatar_url_100', 'avatar_large_url',
              'display_name', 'bio_description', 'profile_deep_link', 'is_verified',
              'username', 'follower_count', 'following_count', 'likes_count', 'video_count'
            ],
          },
        }
      );

      const user = response.data.data.user;

      // Calculate additional metrics for dashboard
      const enhancedUser = {
        ...user,
        // Dashboard-specific calculations
        totalViews: 0, // Will be calculated from videos
        engagementRate: 0, // Will be calculated from videos
        postingFrequency: 0, // Will be calculated from videos
        profilePicture: user.avatar_url || user.avatar_large_url,
        follower_count: user.follower_count || 0,
        following_count: user.following_count || 0,
        likes_count: user.likes_count || 0,
        video_count: user.video_count || 0,
      };

      return enhancedUser;
    } catch (error) {
      this.logger.error('Failed to fetch TikTok user info:', error);
      throw new Error('Failed to fetch TikTok user info');
    }
  }

  // ===== YOUTUBE MANAGEMENT =====

  /**
   * Get YouTube videos with analytics
   */
  async getYouTubeVideos(accessToken: string, limit: number = 20): Promise<ContentItem[]> {
    try {
      this.logger.log('Fetching YouTube videos...');

      // Get user info first
      const userInfo = await this.getYouTubeUserInfo(accessToken);

      // Get videos list using YouTube Data API
      const videosResponse = await axios.get(
        'https://www.googleapis.com/youtube/v3/search',
        {
          params: {
            part: 'snippet',
            forMine: true,
            type: 'video',
            maxResults: limit,
            key: this.configService.get('YOUTUBE_API_KEY'),
          },
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );

      const videos = videosResponse.data.items || [];

      // Get analytics for each video
      const videosWithAnalytics = await Promise.all(
        videos.map(async (video: any) => {
          const analytics = await this.getYouTubeVideoAnalytics(accessToken, video.id.videoId);

          return {
            id: video.id.videoId,
            title: video.snippet.title,
            description: video.snippet.description,
            url: `https://www.youtube.com/watch?v=${video.id.videoId}`,
            thumbnailUrl: video.snippet.thumbnails?.high?.url,
            publishedAt: new Date(video.snippet.publishedAt),
            metrics: {
              views: analytics.views || 0,
              likes: analytics.likes || 0,
              comments: analytics.comments || 0,
              shares: analytics.shares || 0,
              engagementRate: this.calculateEngagementRate({
                views: analytics.views || 0,
                likes: analytics.likes || 0,
                comments: analytics.comments || 0,
                shares: analytics.shares || 0,
              }),
            },
          };
        })
      );

      return videosWithAnalytics;
    } catch (error) {
      this.logger.error('Failed to fetch YouTube videos:', error);
      throw new Error('Failed to fetch YouTube videos');
    }
  }

  /**
   * Get YouTube user info
   */
  async getYouTubeUserInfo(accessToken: string): Promise<any> {
    try {
      const response = await axios.get(
        'https://www.googleapis.com/youtube/v3/channels',
        {
          params: {
            part: 'snippet,statistics',
            mine: true,
          },
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );

      return response.data.items?.[0] || {};
    } catch (error) {
      this.logger.error('Failed to fetch YouTube user info:', error);
      throw new Error('Failed to fetch YouTube user info');
    }
  }

  /**
   * Get YouTube video analytics
   */
  async getYouTubeVideoAnalytics(accessToken: string, videoId: string): Promise<any> {
    try {
      const response = await axios.get(
        'https://www.googleapis.com/youtube/v3/videos',
        {
          params: {
            part: 'statistics',
            id: videoId,
          },
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );

      const video = response.data.items?.[0];
      if (!video) return {};

      return {
        views: parseInt(video.statistics.viewCount) || 0,
        likes: parseInt(video.statistics.likeCount) || 0,
        comments: parseInt(video.statistics.commentCount) || 0,
        shares: 0, // YouTube doesn't provide share count in basic API
      };
    } catch (error) {
      this.logger.error(`Failed to fetch YouTube video analytics for ${videoId}:`, error);
      return { views: 0, likes: 0, comments: 0, shares: 0 };
    }
  }

  // ===== UTILITY METHODS =====

  /**
   * Calculate engagement rate
   */
  private calculateEngagementRate(stats: any): number {
    const { views = 0, likes = 0, comments = 0, shares = 0 } = stats;
    const totalEngagement = likes + comments + shares;

    if (views === 0) return 0;

    return Math.round((totalEngagement / views) * 100 * 100) / 100; // Round to 2 decimal places
  }

  /**
   * Get platform-specific content
   */
  async getPlatformContent(platform: string, accessToken: string, limit: number = 20): Promise<ContentItem[]> {
    switch (platform.toLowerCase()) {
      case 'tiktok':
        return this.getTikTokVideos(accessToken, limit);
      case 'youtube':
        return this.getYouTubeVideos(accessToken, limit);
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
  }

  /**
   * Get platform-specific user info
   */
  async getPlatformUserInfo(platform: string, accessToken: string): Promise<any> {
    switch (platform.toLowerCase()) {
      case 'tiktok':
        return this.getTikTokUserInfo(accessToken);
      case 'youtube':
        return this.getYouTubeUserInfo(accessToken);
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
  }
}
