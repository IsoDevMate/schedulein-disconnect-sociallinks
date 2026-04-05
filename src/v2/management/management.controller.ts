import { Controller, Get, Query, UseGuards, Request, BadRequestException } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiQuery,
} from '@nestjs/swagger';
import { ManagementService } from './management.service';
import { V2JwtAuthGuard } from '../account-connect/guards/v2-jwt-auth.guard';

@ApiTags('v2-management')
@Controller('v2/management')
@UseGuards(V2JwtAuthGuard)
@ApiBearerAuth()
export class ManagementController {
  constructor(private readonly managementService: ManagementService) {}

  // ===== TIKTOK MANAGEMENT ENDPOINTS =====

  @Get('tiktok/videos')
  @ApiOperation({
    summary: 'Get TikTok videos with analytics',
    description: 'Retrieve TikTok videos with comprehensive analytics data. Includes view counts, engagement metrics, and performance insights. Requires management token from TikTok OAuth flow.'
  })
  @ApiResponse({
    status: 200,
    description: 'TikTok videos retrieved successfully',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Number of videos to retrieve (default: 20)' })
  async getTikTokVideos(
    @Request() req,
    @Query('limit') limit?: number,
  ): Promise<any[]> {
    try {
      // In a real app, you'd get the management token from the user's stored tokens
      // For now, we'll require it as a query parameter for testing
      const { managementToken } = req.query;

      if (!managementToken) {
        throw new BadRequestException('Management token required. Please complete TikTok management OAuth flow first.');
      }

      return this.managementService.getTikTokVideos(managementToken, limit || 20);
    } catch (error) {
      throw new BadRequestException(`Failed to fetch TikTok videos: ${error.message}`);
    }
  }



  @Get('tiktok/dashboard')
  @ApiOperation({
    summary: 'Get TikTok dashboard data',
    description: 'Comprehensive TikTok dashboard with profile information, video analytics, posting patterns, and performance metrics. Provides complete overview for content optimization.'
  })
  @ApiResponse({
    status: 200,
    description: 'TikTok dashboard data retrieved successfully',
  })
  async getTikTokDashboard(@Request() req): Promise<any> {
    try {
      const { managementToken } = req.query;

      if (!managementToken) {
        throw new BadRequestException('Management token required. Please complete TikTok management OAuth flow first.');
      }

      // Get both profile and videos to calculate comprehensive dashboard metrics
      const [profile, videos] = await Promise.all([
        this.managementService.getTikTokUserInfo(managementToken),
        this.managementService.getTikTokVideos(managementToken, 50) // Get more videos for better analytics
      ]);

      // Extract hashtags from video descriptions
      const hashtags = this.extractHashtags(videos);

      // Calculate posting times
      const postingTimes = this.calculatePostingTimes(videos);

      return {
        profile: {
          username: profile.username,
          displayName: profile.display_name,
          profilePicture: profile.profilePicture,
          followerCount: profile.follower_count,
          followingCount: profile.following_count,
          likesCount: profile.likes_count,
          videoCount: profile.video_count,
          bioDescription: profile.bio_description,
          isVerified: profile.is_verified,
          profileDeepLink: profile.profile_deep_link
        },
        metrics: {
          totalViews: profile.totalViews || 0,
          engagementRate: profile.engagementRate || 0,
          postingFrequency: profile.postingFrequency || 0
        },
        content: {
          videos: videos.slice(0, 20), // Return first 20 for display
          totalVideos: videos.length
        },
        analytics: {
          hashtags: hashtags.slice(0, 10), // Top 10 hashtags
          postingTimes: postingTimes,
          contentPerformance: this.generateContentPerformanceData(videos)
        }
      };
    } catch (error) {
      throw new BadRequestException(`Failed to fetch TikTok dashboard: ${error.message}`);
    }
  }

  // ===== YOUTUBE MANAGEMENT ENDPOINTS =====

  @Get('youtube/videos')
  @ApiOperation({ summary: 'Get YouTube videos with analytics' })
  @ApiResponse({
    status: 200,
    description: 'YouTube videos retrieved successfully',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Number of videos to retrieve (default: 20)' })
  async getYouTubeVideos(
    @Request() req,
    @Query('limit') limit?: number,
  ): Promise<any[]> {
    try {
      const { managementToken } = req.query;

      if (!managementToken) {
        throw new BadRequestException('Management token required. Please complete YouTube management OAuth flow first.');
      }

      return this.managementService.getYouTubeVideos(managementToken, limit || 20);
    } catch (error) {
      throw new BadRequestException(`Failed to fetch YouTube videos: ${error.message}`);
    }
  }



  // ===== GENERIC PLATFORM ENDPOINTS =====

  @Get('content')
  @ApiOperation({ summary: 'Get platform content with analytics' })
  @ApiResponse({
    status: 200,
    description: 'Platform content retrieved successfully',
  })
  @ApiQuery({ name: 'platform', required: true, enum: ['tiktok', 'youtube'], description: 'Platform to fetch content from' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Number of items to retrieve (default: 20)' })
  async getPlatformContent(
    @Request() req,
    @Query('platform') platform: string,
    @Query('limit') limit?: number,
  ): Promise<any[]> {
    try {
      const { managementToken } = req.query;

      if (!managementToken) {
        throw new BadRequestException('Management token required. Please complete platform management OAuth flow first.');
      }

      if (!['tiktok', 'youtube'].includes(platform.toLowerCase())) {
        throw new BadRequestException('Unsupported platform. Use "tiktok" or "youtube".');
      }

      return this.managementService.getPlatformContent(platform, managementToken, limit || 20);
    } catch (error) {
      throw new BadRequestException(`Failed to fetch ${platform} content: ${error.message}`);
    }
  }



  // ===== HELPER METHODS =====

  /**
   * Extract hashtags from video descriptions
   */
  private extractHashtags(videos: any[]): string[] {
    const hashtagMap = new Map<string, number>();

    videos.forEach(video => {
      const description = video.description || '';
      const hashtags = description.match(/#\w+/g) || [];

      hashtags.forEach(hashtag => {
        const count = hashtagMap.get(hashtag) || 0;
        hashtagMap.set(hashtag, count + 1);
      });
    });

    // Sort by frequency and return top hashtags
    return Array.from(hashtagMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([hashtag]) => hashtag);
  }

  /**
   * Calculate posting times from videos
   */
  private calculatePostingTimes(videos: any[]): any {
    if (videos.length < 3) {
      return {
        message: "No posting time data available.",
        instructions: "Publish content on your TikTok account to view posting time analytics. We need at least 3 videos to analyze optimal posting times."
      };
    }

    // Group videos by hour of day
    const hourCounts = new Array(24).fill(0);
    videos.forEach(video => {
      const hour = new Date(video.publishedAt).getHours();
      hourCounts[hour]++;
    });

    // Find top posting hours
    const topHours = hourCounts
      .map((count, hour) => ({ hour, count }))
      .filter(item => item.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      topHours: topHours.map(item => ({
        hour: item.hour,
        time: `${item.hour}:00`,
        count: item.count
      })),
      totalVideos: videos.length
    };
  }

  /**
   * Generate content performance data for charts
   */
  private generateContentPerformanceData(videos: any[]): any {
    if (videos.length === 0) {
      return {
        message: "No content performance data available.",
        data: []
      };
    }

    // Group videos by date (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const dailyViews = new Map<string, number>();
    const dailyLikes = new Map<string, number>();

    videos.forEach(video => {
      const videoDate = new Date(video.publishedAt);
      if (videoDate > thirtyDaysAgo) {
        const dateKey = videoDate.toISOString().split('T')[0];

        dailyViews.set(dateKey, (dailyViews.get(dateKey) || 0) + video.metrics.views);
        dailyLikes.set(dateKey, (dailyLikes.get(dateKey) || 0) + video.metrics.likes);
      }
    });

    // Convert to array format for charts
    const performanceData = Array.from(dailyViews.keys()).map(date => ({
      date,
      views: dailyViews.get(date) || 0,
      likes: dailyLikes.get(date) || 0
    }));

    return {
      dailyData: performanceData.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
      totalPeriod: 30,
      totalViews: Array.from(dailyViews.values()).reduce((sum, views) => sum + views, 0),
      totalLikes: Array.from(dailyLikes.values()).reduce((sum, likes) => sum + likes, 0)
    };
  }
}
