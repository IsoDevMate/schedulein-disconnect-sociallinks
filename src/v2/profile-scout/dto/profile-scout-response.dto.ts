import { ApiProperty } from '@nestjs/swagger';

export class ProfileInfoDto {
  @ApiProperty({ description: 'Creator username', example: 'mrbeast' })
  username: string;

  @ApiProperty({ description: 'Creator display name', example: 'MrBeast' })
  displayName: string;

  @ApiProperty({ description: 'Creator bio/description', example: 'Let\'s get 2 Million People Clean Water 💧' })
  bio: string;

  @ApiProperty({ description: 'Profile picture URL', example: 'https://example.com/profile.jpg' })
  profilePictureUrl: string;

  @ApiProperty({ description: 'Follower count', example: 119300000 })
  followerCount: number;

  @ApiProperty({ description: 'Following count', example: 340 })
  followingCount: number;

  @ApiProperty({ description: 'Total likes received', example: 1200000000 })
  totalLikes: number;

  @ApiProperty({ description: 'Total videos posted', example: 420 })
  totalVideos: number;

  @ApiProperty({ description: 'Account region', example: 'United States' })
  region: string;

  @ApiProperty({ description: 'Whether account is verified', example: true })
  isVerified: boolean;
}

export class PerformanceSnapshotDto {
  @ApiProperty({ description: 'Total views across analyzed videos', example: '11.1B' })
  totalViews: string;

  @ApiProperty({ description: 'Total likes across analyzed videos', example: '262.8M' })
  totalLikes: string;

  @ApiProperty({ description: 'Average engagement rate', example: '2.57%' })
  averageEngagementRate: string;

  @ApiProperty({ description: 'Average virality score (0-100)', example: '62.4' })
  averageViralityScore: string;

  @ApiProperty({ description: 'Number of videos analyzed', example: 40 })
  videosAnalyzed: number;
}

export class KeywordAnalysisDto {
  @ApiProperty({ description: 'Top performing keywords with engagement rates' })
  topPerforming: Array<{
    keyword: string;
    views: string;
    videos: number;
    engagement: string;
  }>;

  @ApiProperty({ description: 'Most viewed keywords with average views' })
  mostViewed: Array<{
    keyword: string;
    totalViews: string;
    videos: number;
    averageViews: string;
  }>;

  @ApiProperty({ description: 'Recommended keywords to use more often' })
  recommended: Array<{
    keyword: string;
    engagementRate: string;
    reason: string;
  }>;

  @ApiProperty({ description: 'Keywords to reconsider due to poor performance' })
  toReconsider: Array<{
    keyword: string;
    performance: string;
    reason: string;
  }>;
}

export class VideoInfoDto {
  @ApiProperty({ description: 'Video ID', example: 'abc123' })
  videoId: string;

  @ApiProperty({ description: 'Video title', example: 'Slippery vs Sticky Stairs' })
  title: string;

  @ApiProperty({ description: 'Video thumbnail URL', example: 'https://example.com/thumb.jpg' })
  thumbnailUrl: string;

  @ApiProperty({ description: 'View count', example: '671.0M' })
  views: string;

  @ApiProperty({ description: 'Like count', example: '7.4M' })
  likes: string;

  @ApiProperty({ description: 'Engagement rate', example: '1.10%' })
  engagementRate: string;

  @ApiProperty({ description: 'Virality score (0-100)', example: '70.8' })
  viralityScore: string;

  @ApiProperty({ description: 'Video duration in seconds', example: 36 })
  duration: number;

  @ApiProperty({ description: 'Direct URL to video', example: 'https://youtube.com/watch?v=abc123' })
  url: string;

  @ApiProperty({ description: 'Upload date', example: '2025-05-16' })
  publishedAt: string;
}

export class BestPostingTimesDto {
  @ApiProperty({ description: 'Best posting times ranked by performance' })
  topTimes: Array<{
    time: string;
    day: string;
    performance: string;
  }>;

  @ApiProperty({ description: 'Weekly posting frequency', example: '1 posts' })
  weeklyFrequency: string;

  @ApiProperty({ description: 'Posting pattern description', example: 'Very Low' })
  pattern: string;

  @ApiProperty({ description: 'Analysis period in days', example: 169 })
  analysisPeriod: number;
}

export class AudienceDemographicsDto {
  @ApiProperty({
    description: 'Country distribution with percentages and counts (inferred from content analysis, language detection, and geotags)'
  })
  countries: Array<{
    country: string;
    percentage: string;
    count: string;
  }>;

  @ApiProperty({
    description: 'Total audience size estimate (based on follower count with demographic breakdown)',
    example: '3300000'
  })
  totalAudience: string;

  @ApiProperty({
    description: 'Age group distribution (research-backed inference based on Stanford/MIT studies on social media demographic prediction)',
    example: { genZ: 60, millennial: 30, genX: 8, boomer: 2 },
    required: false
  })
  ageGroups?: {
    genZ: number;
    millennial: number;
    genX: number;
    boomer: number;
  };

  @ApiProperty({
    description: 'Gender distribution (78%+ accuracy based on research-backed language patterns and content analysis)',
    example: { male: 45, female: 55, other: 0 },
    required: false
  })
  gender?: {
    male: number;
    female: number;
    other: number;
  };

  @ApiProperty({
    description: 'Confidence score for demographic inference (overall confidence in demographic predictions 0-100%)',
    example: 75,
    required: false
  })
  confidence?: number;

  @ApiProperty({
    description: 'Signal contributions breakdown (shows which signals contributed to the demographic inference)',
    example: { textAnalysis: 40, behavioralPatterns: 30, contentClassification: 20, crossPlatformCorrelation: 10 },
    required: false
  })
  signalContributions?: {
    textAnalysis: number;
    behavioralPatterns: number;
    contentClassification: number;
    crossPlatformCorrelation: number;
  };

  @ApiProperty({
    description: 'Note about data inference methodology',
    example: 'Demographics inferred from content analysis with 75% confidence using multi-signal ensemble with NLP, behavioral, and content analysis',
    required: false
  })
  note?: string;

  @ApiProperty({
    description: 'Data source information',
    example: 'inferred - content analysis and pattern recognition',
    required: false
  })
  dataSource?: string;
}

export class ContentIdeasDto {
  @ApiProperty({ description: 'AI-generated content ideas based on analysis' })
  ideas: Array<{
    title: string;
    description: string;
    potentialScore: number;
    contentType: string;
    hashtags: string[];
  }>;
}

export class ProfileScoutResponseDto {
  @ApiProperty({ description: 'Analysis ID for tracking', example: 'analysis_123' })
  analysisId: string;

  @ApiProperty({ description: 'Credits used for this analysis', example: 1 })
  creditsUsed: number;

  @ApiProperty({ description: 'Platform analyzed', example: 'youtube' })
  platform: string;

  @ApiProperty({ description: 'Username analyzed', example: 'mrbeast' })
  username: string;

  @ApiProperty({ description: 'Profile information' })
  profileInfo: ProfileInfoDto;

  @ApiProperty({ description: 'Performance snapshot metrics' })
  performanceSnapshot: PerformanceSnapshotDto;

  @ApiProperty({ description: 'Keyword analysis results' })
  keywordAnalysis: KeywordAnalysisDto;

  @ApiProperty({ description: 'Recent videos with performance data' })
  recentVideos: VideoInfoDto[];

  @ApiProperty({ description: 'Best posting times analysis' })
  bestPostingTimes: BestPostingTimesDto;

  @ApiProperty({ description: 'Audience demographics data' })
  audienceDemographics: AudienceDemographicsDto;

  @ApiProperty({ description: 'AI-generated content ideas' })
  contentIdeas: ContentIdeasDto;

  @ApiProperty({ description: 'Analysis completion timestamp', example: '2025-01-20T10:30:00Z' })
  analyzedAt: string;
}
