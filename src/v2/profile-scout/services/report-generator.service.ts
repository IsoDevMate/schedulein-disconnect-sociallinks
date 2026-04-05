import { Injectable, Logger, Inject } from '@nestjs/common';
import { YouTubeProfileService } from './youtube-profile.service';
import { TikTokProfileService } from './tiktok-profile.service';
import { KeywordAnalyzerService } from './keyword-analyzer.service';
import { SmartDemographicsService } from './smart-demographics.service';
import { YouTubeChannelResolverService } from '../../../youtube/services/youtube-channel-resolver.service';
import { ContentIdeaService } from '../../../youtube/services/content-idea.service';
import { ProfileScoutData, VideoInfo } from '../interfaces/profile-scout.interface';
import { ProfileScoutResponseDto } from '../dto/profile-scout-response.dto';
import { ProfilePlatform } from '../dto/profile-scout-request.dto';

@Injectable()
export class ReportGeneratorService {
  private readonly logger = new Logger(ReportGeneratorService.name);

  constructor(
    private readonly youtubeProfileService: YouTubeProfileService,
    private readonly tiktokProfileService: TikTokProfileService,
    private readonly keywordAnalyzerService: KeywordAnalyzerService,
    private readonly smartDemographicsService: SmartDemographicsService,
    private readonly channelResolver: YouTubeChannelResolverService,
    private readonly contentIdeaService: ContentIdeaService,
  ) {}

  /**
   * Generate complete Profile Scout report
   */
  async generateReport(
    platform: ProfilePlatform,
    username: string,
    includeIdeaSpark: boolean = true,
    maxVideos: number = 50,
    analysisId?: string,
    userId?: string,
  ): Promise<ProfileScoutResponseDto> {
    try {
      this.logger.log(`Generating Profile Scout report for ${platform} user: ${username}`);

      // Get platform-specific data
      const profileData = await this.getPlatformData(platform, username, maxVideos, userId);

      // Generate content ideas if requested
      if (includeIdeaSpark) {
        profileData.contentIdeas = await this.generateContentIdeas(profileData.videos);
      }

      // Convert to response DTO
      const response = this.convertToResponseDto(platform, username, profileData, analysisId);

      this.logger.log(`Profile Scout report generated successfully for ${username}`);
      return response;
    } catch (error) {
      this.logger.error(`Error generating Profile Scout report: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get platform-specific data
   */
  private async getPlatformData(
    platform: ProfilePlatform,
    username: string,
    maxVideos: number,
    userId?: string,
  ): Promise<ProfileScoutData> {
    if (platform === ProfilePlatform.YOUTUBE) {
      return await this.getYouTubeData(username, maxVideos, userId);
    } else if (platform === ProfilePlatform.TIKTOK) {
      return await this.getTikTokData(username, maxVideos);
    } else {
      throw new Error(`Unsupported platform: ${platform}`);
    }
  }

  /**
   * Get YouTube data
   */
  private async getYouTubeData(username: string, maxVideos: number, userId?: string): Promise<ProfileScoutData> {
    // Get channel info
    const profileInfo = await this.youtubeProfileService.getChannelByUsername(username);

    // Get recent videos
    const channelId = await this.getChannelId(username);
    const videos = await this.youtubeProfileService.getRecentVideos(channelId, maxVideos);

    // Calculate metrics
    const performanceMetrics = this.youtubeProfileService.calculatePerformanceMetrics(videos);
    const bestPostingTimes = this.youtubeProfileService.calculateBestPostingTimes(videos);

    // NEW: Enhanced demographics with comment analysis
    const audienceDemographics = await this.youtubeProfileService.getAudienceDemographicsWithComments(
      channelId,
      videos,
      profileInfo.followerCount
    );

    // Analyze keywords
    const keywordAnalysis = await this.keywordAnalyzerService.analyzeKeywords(videos);

    return {
      profileInfo,
      videos,
      performanceMetrics,
      keywordAnalysis,
      bestPostingTimes,
      audienceDemographics,
      contentIdeas: [], // Will be populated later
    };
  }

  /**
   * Get TikTok data
   */
  private async getTikTokData(username: string, maxVideos: number): Promise<ProfileScoutData> {
    // Get profile info
    const profileInfo = await this.tiktokProfileService.getProfileByUsername(username);

    // Get recent videos
    const videos = await this.tiktokProfileService.getRecentVideos(username, maxVideos);

    // Calculate metrics
    const performanceMetrics = this.tiktokProfileService.calculatePerformanceMetrics(videos);
    const bestPostingTimes = this.tiktokProfileService.calculateBestPostingTimes(videos);

    // NEW: Smart demographics inference using free, rule-based approach
    const demographicInference = await this.smartDemographicsService.inferDemographics(videos, username);
    const audienceDemographics = {
      countries: demographicInference.countries.map(c => ({
        country: c.country,
        percentage: c.percentage,
        count: Math.round((profileInfo.followerCount * c.percentage) / 100)
      })),
      totalAudience: profileInfo.followerCount,
      note: `Demographics inferred from content analysis with ${demographicInference.confidence}% confidence`,
      dataSource: demographicInference.dataSource,
      ageGroups: demographicInference.ageGroups,
      gender: demographicInference.gender
    };

    // Analyze keywords
    const keywordAnalysis = await this.keywordAnalyzerService.analyzeKeywords(videos);

    // Generate content ideas using AI service
    const contentIdeas = await this.generateContentIdeas(videos);

    // Update profile info with real metrics from videos
    const updatedProfileInfo = {
      ...profileInfo,
    };

    return {
      profileInfo: updatedProfileInfo,
      videos,
      performanceMetrics,
      keywordAnalysis,
      bestPostingTimes,
      audienceDemographics,
      contentIdeas,
    };
  }

  /**
   * Generate content ideas based on actual video analysis
   */
  private async generateContentIdeas(videos: VideoInfo[]): Promise<any[]> {
    try {
      if (videos.length === 0) {
        return [];
      }

      // For very small channels with limited content, generate ideas based on actual video content
      const totalViews = videos.reduce((sum, video) => sum + video.views, 0);
      const totalLikes = videos.reduce((sum, video) => sum + video.likes, 0);

      if (totalViews < 100) {
        this.logger.log(`Channel has very limited views (${totalViews}) - generating ideas based on actual content`);
        return this.generateIdeasBasedOnActualContent(videos);
      }

      // Use the AI-powered ContentIdeaService for larger channels
      const detectedNiche = this.detectOverallNiche(videos);
      this.logger.log(`Detected niche: ${detectedNiche} for content idea generation`);

      // Get top performing keywords for context
      const topKeywords = videos
        .flatMap(v => v.hashtags)
        .filter(tag => tag.startsWith('#'))
        .reduce((acc, tag) => {
          acc[tag] = (acc[tag] || 0) + 1;
          return acc;
        }, {} as { [key: string]: number });

      const topHashtags = Object.entries(topKeywords)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
        .map(([tag]) => tag);

      const aiIdeas = await this.contentIdeaService.generateContentIdeas({
        niche: detectedNiche,
        limit: 5,
        minPotentialScore: 0.3,
        // Add user's actual content context
        userContext: {
          topHashtags,
          averageViews: videos.reduce((sum, v) => sum + v.views, 0) / videos.length,
          averageEngagement: videos.reduce((sum, v) => sum + v.engagementRate, 0) / videos.length,
          recentTitles: videos.slice(0, 3).map(v => v.title),
        }
      });

      // Convert AI ideas to the expected format
      const formattedIdeas = aiIdeas.map(idea => ({
        title: idea.title,
        description: idea.description,
        potentialScore: idea.potentialScore,
        contentType: idea.contentType,
        hashtags: idea.hashtags,
        targetAudience: idea.targetAudience,
        estimatedDuration: idea.estimatedDuration,
        niche: idea.niche,
        riskLevel: idea.riskLevel,
        timeToCreate: idea.timeToCreate,
        contentStructure: idea.contentStructure,
        trendingElements: idea.trendingElements,
      }));

      // If AI service doesn't return enough ideas, generate fallback ideas based on actual content
      if (formattedIdeas.length < 3) {
        const fallbackIdeas = this.generateIdeasBasedOnActualContent(videos);
        formattedIdeas.push(...fallbackIdeas);
      }

      return formattedIdeas.slice(0, 10); // Limit to 10 ideas
    } catch (error) {
      this.logger.error('Error generating content ideas with AI service:', error);
      // Fallback to ideas based on actual content
      return this.generateIdeasBasedOnActualContent(videos);
    }
  }

  /**
   * Generate content ideas based on actual channel content
   */
  private generateIdeasBasedOnActualContent(videos: VideoInfo[]): any[] {
    const ideas: any[] = [];

    // Extract common themes from actual videos
    const channelTheme = this.detectChannelTheme(videos);

    // Generate ideas based on actual content patterns
    if (channelTheme.includes('afro') || channelTheme.includes('advertising')) {
      ideas.push({
        title: "Behind the Scenes: Creating Afro Beauty Content",
        description: "Show your creative process and the work that goes into your beauty and advertising content.",
        potentialScore: 0.7,
        contentType: "story",
        hashtags: ["#BehindTheScenes", "#AfroBeauty", "#ContentCreation", "#BeautyTips", "#CreativeProcess"]
      });

      ideas.push({
        title: "Afro Beauty Tutorial: Quick Styling Tips",
        description: "Share quick and easy styling tips for afro hair that your audience can try at home.",
        potentialScore: 0.8,
        contentType: "tutorial",
        hashtags: ["#AfroHairTips", "#BeautyTutorial", "#HairStyling", "#NaturalHair", "#QuickTips"]
      });
    }

    if (channelTheme.includes('hello') || channelTheme.includes('man')) {
      ideas.push({
        title: "Getting to Know Your Creator: Personal Story",
        description: "Share your personal journey and what inspired you to start creating content.",
        potentialScore: 0.6,
        contentType: "story",
        hashtags: ["#PersonalStory", "#CreatorJourney", "#BehindTheScenes", "#Motivation", "#Inspiration"]
      });
    }

    // Add general ideas based on channel performance
    ideas.push({
      title: "Community Q&A: Answering Your Questions",
      description: "Engage with your audience by answering their questions about your content and interests.",
      potentialScore: 0.9,
      contentType: "tips",
      hashtags: ["#QandA", "#Community", "#Engagement", "#Questions", "#Interaction"]
    });

    ideas.push({
      title: "Day in My Life: Content Creator Edition",
      description: "Show your audience what a typical day looks like as a content creator.",
      potentialScore: 0.8,
      contentType: "story",
      hashtags: ["#DayInMyLife", "#ContentCreator", "#Lifestyle", "#Vlog", "#DailyRoutine"]
    });

    return ideas.slice(0, 5);
  }

  /**
   * Detect channel theme from video content
   */
  private detectChannelTheme(videos: VideoInfo[]): string {
    const allText = videos.map(v => `${v.title} ${v.description}`).join(' ').toLowerCase();

    const themes = {
      'beauty': ['afro', 'beauty', 'makeup', 'hair', 'styling', 'ladies'],
      'advertising': ['advertising', 'promotion', 'marketing', 'brand'],
      'personal': ['hello', 'man', 'personal', 'life', 'story'],
      'entertainment': ['fun', 'funny', 'entertainment', 'comedy', 'reaction']
    };

    for (const [theme, keywords] of Object.entries(themes)) {
      if (keywords.some(keyword => allText.includes(keyword))) {
        return theme;
      }
    }

    return 'general';
  }

  /**
   * Generate fallback content ideas when AI service fails
   */
  private generateFallbackIdeas(videos: VideoInfo[]): any[] {
    const ideas = [];

    // Analyze top performing videos
    const topVideos = videos
      .sort((a, b) => b.views - a.views)
      .slice(0, 3);

    // Generate ideas based on successful patterns
    topVideos.forEach((video, index) => {
      ideas.push({
        title: `Create content similar to "${video.title}"`,
        description: `Based on your top performing video with ${this.formatNumber(video.views)} views`,
        potentialScore: Math.min(1, (video.views / 1000000) * 10),
        contentType: this.detectContentType(video.title),
        hashtags: video.hashtags.slice(0, 5),
        targetAudience: 'Your existing audience',
        estimatedDuration: video.duration || 30,
        niche: this.detectNicheFromVideo(video),
        riskLevel: 'medium',
        timeToCreate: 'medium',
      });
    });

    return ideas;
  }

  /**
   * Detect niche from a single video
   */
  private detectNicheFromVideo(video: VideoInfo): string {
    const title = video.title.toLowerCase();
    const description = video.description.toLowerCase();
    const text = `${title} ${description}`;

    const niches = {
      'real-estate': ['real estate', 'realestate', 'property', 'house', 'home', 'villa', 'mansion', 'maisonette', 'housetour', 'houseforsale', 'property tour', 'luxury home', 'interior design', 'architecture', 'land', 'investment', 'buying', 'selling'],
      'fitness': ['workout', 'gym', 'exercise', 'fitness', 'health', 'running', 'marathon', 'training'],
      'food+drink': ['recipe', 'cook', 'food', 'kitchen', 'baking', 'cooking', 'restaurant', 'cuisine'],
      'beauty': ['makeup', 'beauty', 'skincare', 'cosmetics', 'haircut', 'manicure', 'pedicure', 'facial', 'massage'],
      'fashion': ['fashion', 'style', 'outfit', 'clothing'],
      'gaming': ['gaming', 'game', 'playthrough', 'esports', 'streaming'],
      'technology': ['technology', 'tech', 'gadget', 'app', 'software'],
      'education': ['learn', 'tutorial', 'education', 'study', 'tips'],
      'entertainment': ['funny', 'comedy', 'dance', 'music', 'entertainment'],
      'lifestyle': ['lifestyle', 'daily', 'routine', 'life'],
      'travel': ['travel', 'trip', 'vacation', 'destination', 'tourism'],
      'business': ['business', 'entrepreneur', 'startup', 'marketing', 'finance'],
      'relationships': ['dating', 'relationship', 'love', 'marriage', 'couples'],
      'finance': ['finance', 'money', 'investment', 'trading', 'crypto'],
      'crypto': ['crypto', 'bitcoin', 'blockchain', 'trading', 'cryptocurrency'],
    };

    // Count keyword matches for each niche
    const nicheScores: { [key: string]: number } = {};

    for (const [niche, keywords] of Object.entries(niches)) {
      nicheScores[niche] = keywords.filter(keyword => text.includes(keyword)).length;
    }

    // Find the niche with the highest score
    const bestNiche = Object.entries(nicheScores).reduce((a, b) => nicheScores[a[0]] > nicheScores[b[0]] ? a : b);

    // Return the best niche if it has at least 1 match, otherwise 'general'
    return nicheScores[bestNiche[0]] > 0 ? bestNiche[0] : 'general';
  }

  /**
   * Detect overall niche from all videos
   */
  private detectOverallNiche(videos: VideoInfo[]): string {
    const niches = videos.map(video => this.detectNicheFromVideo(video));
    const nicheCounts = niches.reduce((acc, niche) => {
      acc[niche] = (acc[niche] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const sortedNiches = Object.entries(nicheCounts).sort((a, b) => b[1] - a[1]);
    return sortedNiches[0] ? sortedNiches[0][0] : 'general';
  }

  /**
   * Convert internal data to response DTO
   */
  private convertToResponseDto(
    platform: ProfilePlatform,
    username: string,
    data: ProfileScoutData,
    analysisId?: string,
  ): ProfileScoutResponseDto {
    return {
      analysisId: analysisId || `analysis_${Date.now()}`,
      creditsUsed: 1,
      platform,
      username,
      profileInfo: {
        username: data.profileInfo.username,
        displayName: data.profileInfo.displayName,
        bio: data.profileInfo.bio,
        profilePictureUrl: data.profileInfo.profilePictureUrl,
        followerCount: data.profileInfo.followerCount,
        followingCount: data.profileInfo.followingCount,
        totalLikes: data.profileInfo.totalLikes,
        totalVideos: data.profileInfo.totalVideos,
        region: data.profileInfo.region,
        isVerified: data.profileInfo.isVerified,
      },
      performanceSnapshot: {
        totalViews: this.formatNumber(data.performanceMetrics.totalViews),
        totalLikes: this.formatNumber(data.performanceMetrics.totalLikes),
        averageEngagementRate: `${data.performanceMetrics.averageEngagementRate.toFixed(2)}%`,
        averageViralityScore: data.performanceMetrics.averageViralityScore.toFixed(1),
        videosAnalyzed: data.performanceMetrics.videosAnalyzed,
      },
      keywordAnalysis: {
        topPerforming: data.keywordAnalysis.topPerforming.map(k => ({
          keyword: k.keyword,
          views: this.formatNumber(k.views),
          videos: k.videos,
          engagement: `${k.engagement.toFixed(1)}%`,
        })),
        mostViewed: data.keywordAnalysis.mostViewed.map(k => ({
          keyword: k.keyword,
          totalViews: this.formatNumber(k.views),
          videos: k.videos,
          averageViews: this.formatNumber(k.averageViews),
        })),
        recommended: data.keywordAnalysis.recommended.map(r => ({
          keyword: r.keyword,
          engagementRate: r.engagementRate.toString(),
          reason: r.reason,
        })),
        toReconsider: data.keywordAnalysis.toReconsider.map(r => ({
          keyword: r.keyword,
          performance: r.performance.toString(),
          reason: r.reason,
        })),
      },
      recentVideos: data.videos.map(v => ({
        videoId: v.videoId,
        title: v.title,
        thumbnailUrl: v.thumbnailUrl,
        views: this.formatNumber(v.views),
        likes: this.formatNumber(v.likes),
        engagementRate: `${v.engagementRate.toFixed(2)}%`,
        viralityScore: v.viralityScore.toFixed(1),
        duration: v.duration,
        url: v.url,
        publishedAt: v.publishedAt,
      })),
      bestPostingTimes: {
        topTimes: data.bestPostingTimes.topTimes.map(t => ({
          time: t.time,
          day: t.day,
          performance: this.formatNumber(t.performance),
        })),
        weeklyFrequency: data.bestPostingTimes.weeklyFrequency,
        pattern: data.bestPostingTimes.pattern,
        analysisPeriod: data.bestPostingTimes.analysisPeriod,
      },
      audienceDemographics: {
        countries: data.audienceDemographics.countries.map(c => ({
          country: c.country,
          percentage: `${c.percentage.toFixed(2)}%`,
          count: this.formatNumber(c.count),
        })),
        totalAudience: this.formatNumber(data.audienceDemographics.totalAudience),
        ageGroups: data.audienceDemographics.ageGroups,
        gender: data.audienceDemographics.gender,
        note: data.audienceDemographics.note,
        dataSource: data.audienceDemographics.dataSource,
      },
      contentIdeas: {
        ideas: data.contentIdeas.map(i => ({
          title: i.title,
          description: i.description,
          potentialScore: i.potentialScore,
          contentType: i.contentType,
          hashtags: i.hashtags,
        })),
      },
      analyzedAt: new Date().toISOString(),
    };
  }

  /**
   * Get YouTube channel ID from username
   */
  private async getChannelId(username: string): Promise<string> {
    try {
      const channelData = await this.channelResolver.resolveChannel(username);
      return channelData.channelId;
    } catch (error) {
      this.logger.error(`Failed to resolve channel ID for ${username}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Format number with K, M, B suffixes
   */
  private formatNumber(num: number): string {
    if (num >= 1000000000) {
      return `${(num / 1000000000).toFixed(1)}B`;
    } else if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    } else if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`;
    }
    return num.toString();
  }

  /**
   * Detect content type from title
   */
  private detectContentType(title: string): string {
    const lowerTitle = title.toLowerCase();
    if (lowerTitle.includes('tutorial') || lowerTitle.includes('how to')) return 'tutorial';
    if (lowerTitle.includes('review') || lowerTitle.includes('test')) return 'review';
    if (lowerTitle.includes('vlog') || lowerTitle.includes('day')) return 'vlog';
    if (lowerTitle.includes('comedy') || lowerTitle.includes('funny')) return 'comedy';
    if (lowerTitle.includes('challenge') || lowerTitle.includes('try')) return 'challenge';
    return 'general';
  }

  /**
   * Get popular hashtags from video list
   */
  private getPopularHashtags(hashtags: string[]): string[] {
    const hashtagCount: { [key: string]: number } = {};
    hashtags.forEach(tag => {
      hashtagCount[tag] = (hashtagCount[tag] || 0) + 1;
    });

    return Object.entries(hashtagCount)
      .sort(([, a], [, b]) => b - a)
      .map(([tag]) => tag);
  }
}
