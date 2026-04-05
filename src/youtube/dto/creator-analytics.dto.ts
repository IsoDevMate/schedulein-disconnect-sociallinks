import { ApiProperty } from "@nestjs/swagger";

export class ShortsMetricsDto {
  @ApiProperty({ description: "YouTube video ID" })
  videoId: string;

  @ApiProperty({ description: "Video title" })
  title: string;

  @ApiProperty({ description: "Video description" })
  description: string;

  @ApiProperty({ description: "Channel ID that published the Short" })
  channelId: string;

  @ApiProperty({ description: "Channel title" })
  channelTitle: string;

  @ApiProperty({ description: "Number of views" })
  viewCount: number;

  @ApiProperty({ description: "Number of likes" })
  likeCount: number;

  @ApiProperty({ description: "Number of comments" })
  commentCount: number;

  @ApiProperty({ description: "Engagement rate (likes + comments / views)" })
  engagementRate: number;

  @ApiProperty({ description: "Duration in seconds" })
  duration: number;

  @ApiProperty({ description: "When the Short was published" })
  publishedAt: string;

  @ApiProperty({ description: "Array of hashtags found in the Short" })
  hashtags: string[];

  @ApiProperty({ description: "Thumbnail URL" })
  thumbnailUrl: string;
}

export class NicheTrendingDto {
  @ApiProperty({ description: "Niche being analyzed" })
  niche: string;

  @ApiProperty({ description: "Time range of the analysis" })
  timeRange: string;

  @ApiProperty({ description: "Total number of Shorts analyzed" })
  totalShorts: number;

  @ApiProperty({ description: "Average views per Short" })
  averageViews: number;

  @ApiProperty({ description: "Average engagement rate" })
  averageEngagement: number;

  @ApiProperty({
    type: [ShortsMetricsDto],
    description: "Top performing Shorts",
  })
  topPerformers: ShortsMetricsDto[];

  @ApiProperty({
    type: [ShortsMetricsDto],
    description: "All filtered Shorts with detailed metrics",
  })
  allShorts: Array<
    ShortsMetricsDto & {
      metrics: {
        viewsPerDay: number;
        likeToViewRatio: number;
        commentToViewRatio: number;
      };
    }
  >;

  @ApiProperty({ description: "Analysis insights" })
  insights: {
    optimalDuration: number;
    benchmarkEngagementRate: number;
    competitionLevel: "Low" | "Medium" | "High";
    growthOpportunity: "Low" | "Medium" | "High";
  };

  @ApiProperty({
    description: "Metadata about the analysis",
    type: "object",
    properties: {
      regionCode: { type: "string" },
      minViews: { type: "number" },
      timeRangeStart: { type: "string", format: "date-time" },
      timeRangeEnd: { type: "string", format: "date-time" },
    },
  })
  metadata: {
    regionCode: string;
    minViews: number;
    timeRangeStart: string;
    timeRangeEnd: string;
  };

  @ApiProperty({ description: "When the analysis was last updated" })
  lastUpdated: string;
}

export class HashtagAnalysisDto {
  @ApiProperty({ description: "Hashtag being analyzed" })
  hashtag: string;

  @ApiProperty({ description: "Total number of videos found" })
  totalVideos: number;

  @ApiProperty({ description: "Total views across all videos" })
  totalViews: number;

  @ApiProperty({ description: "Average views per video" })
  averageViews: number;

  @ApiProperty({ description: "Total engagement (likes + comments)" })
  totalEngagement: number;

  @ApiProperty({ description: "Average engagement rate" })
  averageEngagementRate: number;

  @ApiProperty({
    enum: ["rising", "stable", "declining"],
    description: "Trend direction",
  })
  trendDirection: "rising" | "stable" | "declining";

  @ApiProperty({
    enum: ["low", "medium", "high"],
    description: "Competition level",
  })
  competitionLevel: "low" | "medium" | "high";

  @ApiProperty({
    type: [String],
    description: "Top creators using this hashtag",
  })
  topCreators: string[];

  @ApiProperty({ description: "Recommendation for using this hashtag" })
  recommendedFor: string;
}

export class CompetitorAnalysisDto {
  @ApiProperty({ description: "Channel ID" })
  channelId: string;

  @ApiProperty({ description: "Channel title" })
  channelTitle: string;

  @ApiProperty({ description: "Number of Shorts analyzed" })
  shortsCount: number;

  @ApiProperty({ description: "Total views across all Shorts" })
  totalViews: number;

  @ApiProperty({ description: "Average views per Short" })
  averageViews: number;

  @ApiProperty({ description: "Total engagement across all Shorts" })
  totalEngagement: number;

  @ApiProperty({ description: "Average engagement rate" })
  averageEngagementRate: number;

  @ApiProperty({ description: "Estimated posting frequency" })
  postingFrequency: string;

  @ApiProperty({ type: ShortsMetricsDto, description: "Top performing Short" })
  topPerformingShort: ShortsMetricsDto;

  @ApiProperty({ type: [String], description: "Common content themes" })
  contentThemes: string[];

  @ApiProperty({ description: "Estimated growth rate (%)" })
  growthRate: number;
}

export class OptimalTimingDto {
  @ApiProperty({ description: "Niche being analyzed" })
  niche: string;

  @ApiProperty({ description: "Region code" })
  regionCode: string;

  @ApiProperty({
    type: "array",
    items: {
      type: "object",
      properties: {
        hour: { type: "number" },
        averageViews: { type: "number" },
        averageEngagement: { type: "number" },
        posts: { type: "number" },
      },
    },
    description: "Best hours to post",
  })
  bestHours: {
    hour: number;
    averageViews: number;
    averageEngagement: number;
    posts: number;
  }[];

  @ApiProperty({
    type: "array",
    items: {
      type: "object",
      properties: {
        day: { type: "string" },
        averageViews: { type: "number" },
        averageEngagement: { type: "number" },
        posts: { type: "number" },
      },
    },
    description: "Best days to post",
  })
  bestDays: {
    day: string;
    averageViews: number;
    averageEngagement: number;
    posts: number;
  }[];

  @ApiProperty({ description: "Timezone for the posting times" })
  timeZone: string;

  @ApiProperty({ description: "Confidence score (0-100)" })
  confidence: number;

  @ApiProperty({ type: [String], description: "Actionable recommendations" })
  recommendations: string[];

  @ApiProperty({ description: "When the analysis was last updated" })
  lastUpdated: string;
}

export class ContentGapAnalysisDto {
  @ApiProperty({ description: "Niche being analyzed" })
  niche: string;

  @ApiProperty({ description: "Total number of Shorts analyzed" })
  totalAnalyzedShorts: number;

  @ApiProperty({ type: [String], description: "Currently trending topics" })
  trendingTopics: string[];

  @ApiProperty({
    type: "array",
    items: {
      type: "object",
      properties: {
        topic: { type: "string" },
        opportunity: { type: "string" },
        frequency: { type: "number" },
      },
    },
    description: "Identified content opportunities",
  })
  contentOpportunities: {
    topic: string;
    opportunity: "low" | "medium" | "high";
    frequency: number;
  }[];

  @ApiProperty({ type: [String], description: "Underexplored keywords" })
  underexploredKeywords: string[];

  @ApiProperty({ type: [String], description: "Recommended content types" })
  recommendedContentTypes: string[];

  @ApiProperty({
    type: "object",
    properties: {
      competitorCount: { type: "number" },
      saturatedTopics: { type: "array", items: { type: "string" } },
      emptyNiches: { type: "array", items: { type: "string" } },
    },
    description: "Competitive analysis",
  })
  competitiveAnalysis: {
    competitorCount: number;
    saturatedTopics: string[];
    emptyNiches: string[];
  };

  @ApiProperty({ description: "When the analysis was last updated" })
  lastUpdated: string;
}
