export interface ProfileInfo {
  username: string;
  displayName: string;
  bio: string;
  profilePictureUrl: string;
  followerCount: number;
  followingCount: number;
  totalLikes: number;
  totalVideos: number;
  region: string;
  isVerified: boolean;
}

export interface VideoInfo {
  videoId: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  engagementRate: number;
  viralityScore: number;
  duration: number;
  url: string;
  publishedAt: string;
  hashtags: string[];
  demographicSignals?: {
    languages: string[];
    topics: string[];
    geotags: string[];
    slang: string[];
    engagementPattern: any;
  };
}

export interface PerformanceMetrics {
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  averageEngagementRate: number;
  averageViralityScore: number;
  videosAnalyzed: number;
}

export interface KeywordData {
  keyword: string;
  views: number;
  videos: number;
  engagement: number;
  averageViews: number;
}

export interface KeywordAnalysis {
  topPerforming: KeywordData[];
  mostViewed: KeywordData[];
  recommended: Array<{
    keyword: string;
    engagementRate: number;
    reason: string;
  }>;
  toReconsider: Array<{
    keyword: string;
    performance: number;
    reason: string;
  }>;
}

export interface PostingTimeData {
  time: string;
  day: string;
  performance: number;
  frequency: number;
}

export interface BestPostingTimes {
  topTimes: PostingTimeData[];
  weeklyFrequency: string;
  pattern: string;
  analysisPeriod: number;
}

export interface AudienceDemographics {
  countries: Array<{
    country: string;
    percentage: number;
    count: number;
  }>;
  totalAudience: number;
  note?: string;
  dataSource?: string;
  ageGroups?: {
    genZ: number;
    millennial: number;
    genX: number;
    boomer: number;
  };
  gender?: {
    male: number;
    female: number;
    other: number;
  };
  confidence?: number;
  signalContributions?: {
    textAnalysis: number;
    behavioralPatterns: number;
    contentClassification: number;
    crossPlatformCorrelation: number;
  };
}

export interface ContentIdea {
  title: string;
  description: string;
  potentialScore: number;
  contentType: string;
  hashtags: string[];
  targetAudience: string;
  estimatedDuration: number;
}

export interface ProfileScoutData {
  profileInfo: ProfileInfo;
  videos: VideoInfo[];
  performanceMetrics: PerformanceMetrics;
  keywordAnalysis: KeywordAnalysis;
  bestPostingTimes: BestPostingTimes;
  audienceDemographics: AudienceDemographics;
  contentIdeas: ContentIdea[];
}

export interface PlatformData {
  platform: 'tiktok' | 'youtube';
  username: string;
  data: ProfileScoutData;
}
