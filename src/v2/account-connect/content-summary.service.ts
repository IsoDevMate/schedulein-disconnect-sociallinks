import { Injectable, Logger } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { AccountConnect } from "./schemas/account-connect.schema";
import { AccountConnectService } from "./account-connect.service";
import { AIRecommendationService, VideoData } from "./services/ai-recommendation.service";
import axios from "axios";

@Injectable()
export class ContentSummaryService {
  private readonly logger = new Logger(ContentSummaryService.name);

  constructor(
    @InjectModel(AccountConnect.name) private accountConnectModel: Model<AccountConnect>,
    private readonly accountConnectService: AccountConnectService,
    private readonly aiRecommendationService: AIRecommendationService,
  ) {}

  async getContentSummary(userId: string, platform: string): Promise<any> {
    try {
      this.logger.debug(`Getting content summary for user ${userId} on platform ${platform}`);

      // First try to find connected account
      let account = await this.accountConnectModel.findOne({
        userId: new Types.ObjectId(userId),
        platform,
        status: 'connected'
      });

      this.logger.debug(`Account search result: ${account ? 'Found' : 'Not found'}`);
      if (account) {
        this.logger.debug(`Found account: ${account.platformUsername} on ${account.platform}`);
      }

      // If no connected account found, return a helpful error message
      if (!account) {
        this.logger.warn(`No connected ${platform} account found for user ${userId}`);
        throw new Error(`No connected ${platform} account found. Please connect your ${platform} account first.`);
      }

      switch (platform) {
        case 'tiktok':
          return await this.getTikTokContentSummary(account);
        case 'youtube':
          return await this.getYouTubeContentSummary(account);
        default:
          throw new Error(`Unsupported platform: ${platform}`);
      }
    } catch (error) {
      this.logger.error(`Failed to get content summary: ${error.message}`, error.stack);
      throw error;
    }
  }

  private async getTikTokContentSummary(account: any): Promise<any> {
    try {
      // Get videos using TikTok v2 video/list endpoint
      const accessToken = account.accessToken;

      if (!accessToken) {
        throw new Error('No access token available for TikTok');
      }

      const videos = await this.getTikTokVideos(accessToken, account);

      // Prepare video data for AI analysis
      const videoData: VideoData[] = videos.map(video => ({
        id: video.id,
        title: video.snippet.title,
        description: video.snippet.description,
        publishedAt: video.snippet.publishedAt,
        viewCount: parseInt(video.statistics?.viewCount) || 0,
        likeCount: parseInt(video.statistics?.likeCount) || 0,
        commentCount: parseInt(video.statistics?.commentCount) || 0,
        engagementRate: this.calculateEngagementRate(video.statistics),
        thumbnailUrl: video.snippet.thumbnails?.medium?.url,
      }));

      // Generate AI-powered recommendations
      const aiRecommendations = await this.aiRecommendationService.generateRecommendations(videoData, 'tiktok');

      const summary = {
        recentVideos: videos.slice(0, 10).map(video => ({
          id: video.id,
          title: video.snippet.title,
          thumbnailUrl: video.snippet.thumbnails?.medium?.url,
          videoUrl: video.snippet.videoUrl, // TikTok video URL
          publishedAt: video.snippet.publishedAt,
          viewCount: parseInt(video.statistics?.viewCount) || 0,
          likeCount: parseInt(video.statistics?.likeCount) || 0,
          commentCount: parseInt(video.statistics?.commentCount) || 0,
          engagementRate: this.calculateEngagementRate(video.statistics),
        })),
        topPerformingHashtags: this.extractHashtagsFromVideos(videos),
        postingTimes: this.analyzePostingTimes(videos),
        contentPerformance: {
          totalVideos: videos.length,
          totalViews: videos.reduce((sum, v) => sum + (parseInt(v.statistics?.viewCount) || 0), 0),
          totalLikes: videos.reduce((sum, v) => sum + (parseInt(v.statistics?.likeCount) || 0), 0),
          averageEngagementRate: this.calculateAverageEngagementRate(videos),
          postingFrequency: this.calculatePostingFrequency(videos),
        },
        recentActivity: {
          lastVideoDate: videos[0]?.snippet?.publishedAt || null,
          videosThisWeek: this.countVideosInTimeRange(videos, 7),
          videosThisMonth: this.countVideosInTimeRange(videos, 30),
        },
        hashtagAnalysis: {
          topHashtags: this.getTopHashtags(videos),
          trendingHashtags: this.getTrendingHashtags(videos),
          hashtagPerformance: this.getHashtagPerformance(videos),
        },
        recommendations: {
          bestPostingTimes: aiRecommendations.bestPostingTimes,
          suggestedHashtags: aiRecommendations.suggestedHashtags,
          contentIdeas: aiRecommendations.contentIdeas,
        },
        contentAnalysis: aiRecommendations.contentAnalysis,
      };



      return summary;
    } catch (error) {
      this.logger.error(`Failed to get TikTok content summary: ${error.message}`, error.stack);
      throw error;
    }
  }

  private async getYouTubeContentSummary(account: any): Promise<any> {
    try {
      // For YouTube, we can use the YouTube Data API to get actual video data
      let accessToken = account.accessToken;

      if (!accessToken) {
        throw new Error('No access token available for YouTube');
      }

      // Check if token is expired and try to refresh it
      this.logger.debug(`Checking token expiry for account ${account._id}:`, {
        tokenExpiry: account.tokenExpiry,
        currentTime: new Date().toISOString(),
        isExpired: account.tokenExpiry ? new Date() > new Date(account.tokenExpiry) : 'no expiry set'
      });

      if (account.tokenExpiry && new Date() > new Date(account.tokenExpiry)) {
        this.logger.warn(`YouTube token expired for account ${account._id}, attempting refresh`);
        try {
          await this.accountConnectService.refreshAccountToken(account._id.toString());
          // Get the updated account with new token
          const updatedAccount = await this.accountConnectModel.findById(account._id);
          accessToken = updatedAccount?.accessToken;
          if (!accessToken) {
            throw new Error('Failed to refresh YouTube token');
          }
          this.logger.debug(`Successfully refreshed YouTube token for account ${account._id}`);
        } catch (refreshError) {
          this.logger.error(`Failed to refresh YouTube token: ${refreshError.message}`);
          throw new Error('YouTube token expired and refresh failed');
        }
      }

      // Get user's videos from YouTube API
      const videos = await this.getYouTubeVideos(accessToken);

      // Prepare video data for AI analysis
      const videoData: VideoData[] = videos.map(video => ({
        id: video.id,
        title: video.snippet.title,
        description: video.snippet.description,
        publishedAt: video.snippet.publishedAt,
        viewCount: parseInt(video.statistics?.viewCount) || 0,
        likeCount: parseInt(video.statistics?.likeCount) || 0,
        commentCount: parseInt(video.statistics?.commentCount) || 0,
        engagementRate: this.calculateEngagementRate(video.statistics),
        thumbnailUrl: video.snippet.thumbnails?.medium?.url,
      }));

      // Generate AI-powered recommendations
      const aiRecommendations = await this.aiRecommendationService.generateRecommendations(videoData, 'youtube');

      const summary = {
        recentVideos: videos.slice(0, 10).map(video => ({
          id: video.id,
          title: video.snippet.title,
          thumbnailUrl: video.snippet.thumbnails?.medium?.url,
          videoUrl: video.snippet.videoUrl, // YouTube video URL
          publishedAt: video.snippet.publishedAt,
          viewCount: parseInt(video.statistics?.viewCount) || 0,
          likeCount: parseInt(video.statistics?.likeCount) || 0,
          commentCount: parseInt(video.statistics?.commentCount) || 0,
          engagementRate: this.calculateEngagementRate(video.statistics),
        })),
        topPerformingHashtags: this.extractHashtagsFromVideos(videos),
        postingTimes: this.analyzePostingTimes(videos),
        contentPerformance: {
          totalVideos: videos.length,
          totalViews: videos.reduce((sum, v) => sum + (parseInt(v.statistics?.viewCount) || 0), 0),
          totalLikes: videos.reduce((sum, v) => sum + (parseInt(v.statistics?.likeCount) || 0), 0),
          averageEngagementRate: this.calculateAverageEngagementRate(videos),
          postingFrequency: this.calculatePostingFrequency(videos),
        },
        recentActivity: {
          lastVideoDate: videos[0]?.snippet?.publishedAt || null,
          videosThisWeek: this.countVideosInTimeRange(videos, 7),
          videosThisMonth: this.countVideosInTimeRange(videos, 30),
        },
        hashtagAnalysis: {
          topHashtags: this.getTopHashtags(videos),
          trendingHashtags: this.getTrendingHashtags(videos),
          hashtagPerformance: this.getHashtagPerformance(videos),
        },
        recommendations: {
          bestPostingTimes: aiRecommendations.bestPostingTimes,
          suggestedHashtags: aiRecommendations.suggestedHashtags,
          contentIdeas: aiRecommendations.contentIdeas,
        },
        contentAnalysis: aiRecommendations.contentAnalysis,
      };

      return summary;
    } catch (error) {
      this.logger.error(`Failed to get YouTube content summary: ${error.message}`, error.stack);
      throw error;
    }
  }

  private async getTikTokVideos(accessToken: string, account: any): Promise<any[]> {
    try {
      this.logger.debug(`Fetching TikTok videos with token: ${accessToken.substring(0, 20)}...`);

      // Step 1: Get video list using /v2/video/list/
      const listResponse = await axios.post(
        'https://open.tiktokapis.com/v2/video/list/',
        {
          max_count: 20, // Get up to 20 videos (API limit)
        },
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          params: {
            fields: 'id,create_time,title,video_description,like_count,comment_count,share_count,view_count,cover_image_url'
          }
        }
      );

      this.logger.debug(`TikTok list API response status: ${listResponse.status}`);
      this.logger.debug(`TikTok list API response data:`, listResponse.data);

      if (!listResponse.data?.data?.videos || listResponse.data.data.videos.length === 0) {
        this.logger.debug('No videos found in list response');
        return [];
      }

      // Extract video IDs from the list
      const videoIds = listResponse.data.data.videos.map((video: any) => video.id);
      this.logger.debug(`Found ${videoIds.length} video IDs:`, videoIds);

      // Step 2: Get detailed video data using /v2/video/query/
      const queryResponse = await axios.post(
        'https://open.tiktokapis.com/v2/video/query/',
        {
          filters: {
            video_ids: videoIds
          }
        },
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          params: {
            fields: 'id,create_time,title,video_description,like_count,comment_count,share_count,view_count,cover_image_url'
          }
        }
      );

      this.logger.debug(`TikTok query API response status: ${queryResponse.status}`);
      this.logger.debug(`TikTok query API response data:`, queryResponse.data);

      if (!queryResponse.data?.data?.videos) {
        this.logger.debug('No videos found in query response');
        return [];
      }

      return queryResponse.data.data.videos.map((video: any) => ({
        id: video.id,
        snippet: {
          title: video.title || 'TikTok Video',
          description: video.video_description || '',
          publishedAt: new Date(video.create_time * 1000).toISOString(),
          thumbnails: {
            medium: { url: video.cover_image_url }
          },
          // Add TikTok video URL
          videoUrl: `https://www.tiktok.com/@${account.platformUsername}/video/${video.id}`
        },
        statistics: {
          viewCount: video.view_count?.toString() || '0',
          likeCount: video.like_count?.toString() || '0',
          commentCount: video.comment_count?.toString() || '0',
          shareCount: video.share_count?.toString() || '0'
        }
      }));
    } catch (error) {
      this.logger.error(`Failed to fetch TikTok videos: ${error.message}`);
      if (error.response) {
        this.logger.error(`TikTok API Error Status: ${error.response.status}`);
        this.logger.error(`TikTok API Error Data:`, error.response.data);
      }
      return [];
    }
  }

  private async getYouTubeVideos(accessToken: string): Promise<any[]> {
    try {
      this.logger.debug(`Fetching YouTube videos with access token: ${accessToken.substring(0, 20)}...`);

      const response = await axios.get(
        'https://www.googleapis.com/youtube/v3/search',
        {
          params: {
            part: 'snippet',
            forMine: true,
            type: 'video',
            order: 'date',
            maxResults: 50,
          },
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );

      this.logger.debug(`YouTube search API response: ${response.data.items?.length || 0} videos found`);

      if (!response.data.items) {
        return [];
      }

      // Get detailed statistics for each video
      const videoIds = response.data.items.map((item: any) => item.id.videoId);
      this.logger.debug(`Fetching statistics for ${videoIds.length} videos`);

      const statsResponse = await axios.get(
        'https://www.googleapis.com/youtube/v3/videos',
        {
          params: {
            part: 'snippet,statistics',
            id: videoIds.join(','),
          },
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );

      this.logger.debug(`YouTube videos API response: ${statsResponse.data.items?.length || 0} videos with statistics`);

      // Add YouTube video URLs to the response
      return (statsResponse.data.items || []).map((video: any) => ({
        ...video,
        snippet: {
          ...video.snippet,
          // Add YouTube video URL
          videoUrl: `https://www.youtube.com/watch?v=${video.id}`
        }
      }));
    } catch (error) {
      this.logger.warn(`Failed to fetch YouTube videos: ${error.message}`);
      if (error.response) {
        this.logger.warn(`YouTube API error response:`, {
          status: error.response.status,
          statusText: error.response.statusText,
          data: error.response.data
        });

        // If it's a 401 error, the token might be expired or invalid
        if (error.response.status === 401) {
          this.logger.warn(`YouTube API returned 401 - token may be expired or invalid`);
        }
      }
      return [];
    }
  }

  private calculateEngagementRate(statistics: any): number {
    if (!statistics) return 0;
    const views = parseInt(statistics.viewCount) || 0;
    const likes = parseInt(statistics.likeCount) || 0;
    const comments = parseInt(statistics.commentCount) || 0;

    if (views === 0) return 0;
    return ((likes + comments) / views) * 100;
  }

  private calculateAverageEngagementRate(videos: any[]): number {
    if (videos.length === 0) return 0;

    const totalEngagement = videos.reduce((sum, video) => {
      return sum + this.calculateEngagementRate(video.statistics);
    }, 0);

    return totalEngagement / videos.length;
  }

  private extractHashtagsFromVideos(videos: any[]): any[] {
    const hashtagCount: { [key: string]: number } = {};
    const hashtagEngagement: { [key: string]: number } = {};

    videos.forEach(video => {
      // Extract hashtags from title and description
      const titleText = video.snippet.title || '';
      const descriptionText = video.snippet.description || '';
      const text = `${titleText} ${descriptionText}`;

      this.logger.debug(`Analyzing text for hashtags: "${text}"`);

      const hashtags = text.match(/#\w+/g) || [];
      this.logger.debug(`Found hashtags: ${hashtags.join(', ')}`);

      hashtags.forEach((hashtag: string) => {
        const cleanHashtag = hashtag.toLowerCase();
        hashtagCount[cleanHashtag] = (hashtagCount[cleanHashtag] || 0) + 1;
        hashtagEngagement[cleanHashtag] = (hashtagEngagement[cleanHashtag] || 0) +
          this.calculateEngagementRate(video.statistics);
      });
    });

    const result = Object.keys(hashtagCount)
      .map(hashtag => ({
        hashtag,
        count: hashtagCount[hashtag],
        engagement: hashtagEngagement[hashtag] / hashtagCount[hashtag],
      }))
      .sort((a, b) => b.engagement - a.engagement)
      .slice(0, 10);

    this.logger.debug(`Extracted hashtags result:`, result);
    return result;
  }

  private analyzePostingTimes(videos: any[]): any[] {
    const postingTimes: { [key: string]: number } = {};

    videos.forEach(video => {
      const date = new Date(video.snippet.publishedAt);
      const day = date.toLocaleDateString('en-US', { weekday: 'long' });
      const hour = date.getHours();
      const timeSlot = `${hour}:00-${hour + 1}:00`;
      const key = `${day} ${timeSlot}`;

      postingTimes[key] = (postingTimes[key] || 0) + 1;
    });

    return Object.entries(postingTimes)
      .map(([time, count]) => ({
        time,
        count,
        engagement: 0, // Would need more data to calculate
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }

  private calculatePostingFrequency(videos: any[]): number {
    if (videos.length === 0) return 0;

    const firstVideo = new Date(videos[videos.length - 1].snippet.publishedAt);
    const lastVideo = new Date(videos[0].snippet.publishedAt);
    const daysDiff = (lastVideo.getTime() - firstVideo.getTime()) / (1000 * 60 * 60 * 24);

    return daysDiff > 0 ? Math.round((videos.length / daysDiff) * 100) / 100 : videos.length;
  }

  private countVideosInTimeRange(videos: any[], days: number): number {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    return videos.filter(video => {
      const videoDate = new Date(video.snippet.publishedAt);
      return videoDate >= cutoffDate;
    }).length;
  }

  private getTopHashtags(videos: any[]): any[] {
    return this.extractHashtagsFromVideos(videos).slice(0, 5);
  }

  private getTrendingHashtags(videos: any[]): any[] {
    const extractedHashtags = this.extractHashtagsFromVideos(videos);

    if (extractedHashtags.length > 0) {
      return extractedHashtags.slice(0, 3);
    }

    // If no hashtags found, provide trending suggestions based on content
    const contentKeywords = this.extractContentKeywords(videos);
    return contentKeywords.slice(0, 3).map(keyword => ({
      hashtag: `#${keyword}`,
      trend: 'rising',
      confidence: 0.7
    }));
  }

  private getHashtagPerformance(videos: any[]): any {
    const hashtags = this.extractHashtagsFromVideos(videos);
    const performance: { [key: string]: any } = {};

    hashtags.forEach(hashtag => {
      performance[hashtag.hashtag] = {
        count: hashtag.count,
        engagement: hashtag.engagement,
        trend: 'stable', // Would need historical data
      };
    });

    return performance;
  }

  private getBestPostingTimes(videos: any[]): any[] {
    const postingTimes = this.analyzePostingTimes(videos);
    return postingTimes.slice(0, 3).map(time => ({
      time: time.time,
      reason: `High posting frequency at this time`,
    }));
  }

  private getSuggestedHashtags(videos: any[]): any[] {
    const extractedHashtags = this.extractHashtagsFromVideos(videos);

    if (extractedHashtags.length > 0) {
      return extractedHashtags.slice(0, 5).map(hashtag => ({
        hashtag: hashtag.hashtag,
        confidence: 0.8,
        reason: `High engagement rate of ${hashtag.engagement.toFixed(1)}%`,
      }));
    }

    // If no hashtags found, suggest based on content keywords
    const contentKeywords = this.extractContentKeywords(videos);
    const trendingHashtags = ['#viral', '#trending', '#fyp', '#foryou', '#tiktok'];

    return [
      ...contentKeywords.slice(0, 3).map(keyword => ({
        hashtag: `#${keyword}`,
        confidence: 0.7,
        reason: `Based on your content keywords`,
      })),
      ...trendingHashtags.slice(0, 2).map(hashtag => ({
        hashtag,
        confidence: 0.6,
        reason: `Currently trending`,
      }))
    ];
  }

  private extractContentKeywords(videos: any[]): string[] {
    const keywords: { [key: string]: number } = {};

    videos.forEach(video => {
      const text = `${video.snippet.title} ${video.snippet.description}`.toLowerCase();

      // Extract meaningful words (3+ characters, not common words)
      const words = text.match(/\b\w{3,}\b/g) || [];
      const commonWords = ['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'her', 'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how', 'man', 'new', 'now', 'old', 'see', 'two', 'way', 'who', 'boy', 'did', 'its', 'let', 'put', 'say', 'she', 'too', 'use'];

      words.forEach((word: string) => {
        if (!commonWords.includes(word) && word.length >= 3) {
          keywords[word] = (keywords[word] || 0) + 1;
        }
      });
    });

    return Object.entries(keywords)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([word]) => word);
  }

  private generateContentIdeas(videos: any[]): any[] {
    // This would integrate with AI service for better ideas
    return [
      { idea: 'Create a compilation of your best moments', confidence: 0.85 },
      { idea: 'Share behind-the-scenes content', confidence: 0.78 },
      { idea: 'Post a tutorial or how-to video', confidence: 0.72 },
      { idea: 'Create a Q&A video', confidence: 0.68 },
      { idea: 'Share your creative process', confidence: 0.65 },
    ];
  }
}
