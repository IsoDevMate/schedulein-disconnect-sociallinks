export interface IViralityScore {
  videoId: string;
  score: number;
  metrics: {
    baseScore: number;
    engagementRate: number;
    recencyFactor: number;
    durationFactor: number;
    isShorts: boolean;
  };
  timestamp: Date;
}

export interface ITrendAnalysis {
  timeRange: "24h" | "7d" | "30d";
  totalVideosAnalyzed: number;
  topHashtags: Array<{
    hashtag: string;
    count: number;
    engagementRate: number;
  }>;
  topTopics: Array<{
    topic: string;
    count: number;
    engagementRate: number;
  }>;
  topNiches: Array<{
    niche: string;
    count: number;
    engagementRate: number;
  }>;
  trendingVideos: Array<{
    videoId: string;
    title: string;
    channelTitle: string;
    viewCount: number;
    engagementRate: number;
    viralityScore: number;
  }>;
  timestamp: Date;
}

export interface INicheAnalysis {
  niche: string;
  metrics: {
    totalVideos: number;
    totalViews: number;
    totalLikes: number;
    totalComments: number;
    avgEngagementRate: number;
    avgViralityScore: number;
  };
  topVideos: Array<{
    videoId: string;
    title: string;
    channelTitle: string;
    views: number;
    engagementRate: number;
    viralityScore: number;
  }>;
  topChannels: Array<{
    channelId: string;
    videoCount: number;
    totalViews: number;
    avgViews: number;
  }>;
  trendingHashtags: Array<{
    hashtag: string;
    count: number;
    engagementRate: number;
  }>;
  contentIdeas: Array<{
    title: string;
    description: string;
    potentialScore: number;
    relatedVideos: Array<{
      videoId: string;
      title: string;
      views: number;
      engagementRate: number;
    }>;
    hashtags: string[];
  }>;
  postingTimeAnalysis: Array<{
    hour: number;
    avgEngagement: number;
    sampleSize: number;
  }>;
  lastUpdated: Date;
  dataSource?: {
    database: number;
    realTime: number;
    combined: number;
    reliability?: number;
  };
}

export interface IContentIdea {
  title: string;
  description: string;
  potentialScore: number;
  relatedVideos: Array<{
    videoId: string;
    title: string;
    views: number;
    engagementRate: number;
  }>;
  hashtags: string[];
}

export interface IAnalyticsService {
  calculateViralityScore(videoId: string): Promise<IViralityScore>;
  analyzeTrends(timeRange: "24h" | "7d" | "30d"): Promise<ITrendAnalysis>;
  analyzeNiche(niche: string): Promise<INicheAnalysis>;
  generateContentIdeas(niche: string, count?: number): Promise<IContentIdea[]>;
}
