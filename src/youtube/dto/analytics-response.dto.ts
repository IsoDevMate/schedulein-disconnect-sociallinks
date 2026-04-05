import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsDate,
  IsNumber,
  IsOptional,
  IsString,
} from "class-validator";

export class ViralityMetricsDto {
  @ApiProperty({
    description: "Base score calculated from engagement and view metrics",
    example: 75.5,
    minimum: 0,
    maximum: 100,
  })
  @IsNumber()
  baseScore: number;

  @ApiProperty({
    description: "Engagement rate percentage (likes + comments / views * 100)",
    example: 4.2,
    minimum: 0,
  })
  @IsNumber()
  engagementRate: number;

  @ApiProperty({
    description: "Recency factor - newer videos get higher scores",
    example: 0.8,
    minimum: 0,
    maximum: 1,
  })
  @IsNumber()
  recencyFactor: number;

  @ApiProperty({
    description: "Duration factor - optimal length for Shorts",
    example: 0.9,
    minimum: 0,
    maximum: 1,
  })
  @IsNumber()
  durationFactor: number;

  @ApiProperty({
    description: "Whether the video is a YouTube Short",
    example: true,
  })
  @IsBoolean()
  isShorts: boolean;
}

export class ViralityScoreResponseDto {
  @ApiProperty({
    description: "YouTube video ID",
    example: "dQw4w9WgXcQ",
  })
  @IsString()
  videoId: string;

  @ApiProperty({
    description: "Virality score from 0-100 (higher = more likely to go viral)",
    example: 85,
    minimum: 0,
    maximum: 100,
  })
  @IsNumber()
  score: number;

  @ApiProperty({
    description: "Detailed metrics used to calculate virality score",
    type: ViralityMetricsDto,
  })
  @Type(() => ViralityMetricsDto)
  metrics: ViralityMetricsDto;

  @ApiProperty({
    description: "Timestamp when the score was calculated",
    example: "2025-01-19T20:30:00.000Z",
  })
  @Type(() => Date)
  @IsDate()
  timestamp: Date;
}

export class TrendingVideoDto {
  @ApiProperty({
    description: "YouTube video ID",
    example: "dQw4w9WgXcQ",
  })
  @IsString()
  videoId: string;

  @ApiProperty({
    description: "Video title",
    example: "Amazing Fitness Workout Routine",
  })
  @IsString()
  title: string;

  @ApiProperty({
    description: "Channel name",
    example: "Fitness Guru",
  })
  @IsString()
  channelTitle: string;

  @ApiProperty({
    description: "Total view count",
    example: 150000,
    minimum: 0,
  })
  @IsNumber()
  viewCount: number;

  @ApiProperty({
    description: "Engagement rate percentage",
    example: 5.2,
    minimum: 0,
  })
  @IsNumber()
  engagementRate: number;

  @ApiProperty({
    description: "Virality score (0-100)",
    example: 78,
    minimum: 0,
    maximum: 100,
  })
  @IsNumber()
  viralityScore: number;
}

export class TopHashtagDto {
  @ApiProperty({
    description: "Hashtag name",
    example: "#fitness",
  })
  @IsString()
  hashtag: string;

  @ApiProperty({
    description: "Number of videos using this hashtag",
    example: 45,
    minimum: 0,
  })
  @IsNumber()
  count: number;

  @ApiProperty({
    description: "Average engagement rate for videos with this hashtag",
    example: 3.8,
    minimum: 0,
  })
  @IsNumber()
  engagementRate: number;
}

export class TopTopicDto {
  @ApiProperty({
    description: "Content topic/category",
    example: "workout",
  })
  @IsString()
  topic: string;

  @ApiProperty({
    description: "Number of videos in this topic",
    example: 23,
    minimum: 0,
  })
  @IsNumber()
  count: number;

  @ApiProperty({
    description: "Average engagement rate for this topic",
    example: 4.1,
    minimum: 0,
  })
  @IsNumber()
  engagementRate: number;
}

export class TopNicheDto {
  @ApiProperty({
    description: "Content niche",
    example: "fitness",
  })
  @IsString()
  niche: string;

  @ApiProperty({
    description: "Number of videos in this niche",
    example: 67,
    minimum: 0,
  })
  @IsNumber()
  count: number;

  @ApiProperty({
    description: "Average engagement rate for this niche",
    example: 4.5,
    minimum: 0,
  })
  @IsNumber()
  engagementRate: number;
}

export class TrendAnalysisResponseDto {
  @ApiProperty({
    description: "Time range for analysis",
    example: "7d",
    enum: ["24h", "7d", "30d"],
  })
  @IsString()
  timeRange: "24h" | "7d" | "30d";

  @ApiProperty({
    description: "Total number of videos analyzed",
    example: 1250,
    minimum: 0,
  })
  @IsNumber()
  totalVideosAnalyzed: number;

  @ApiProperty({
    description: "Top performing hashtags",
    type: [TopHashtagDto],
  })
  @IsArray()
  @Type(() => TopHashtagDto)
  topHashtags: TopHashtagDto[];

  @ApiProperty({
    description: "Top performing topics",
    type: [TopTopicDto],
  })
  @IsArray()
  @Type(() => TopTopicDto)
  topTopics: TopTopicDto[];

  @ApiProperty({
    description: "Top performing niches",
    type: [TopNicheDto],
  })
  @IsArray()
  @Type(() => TopNicheDto)
  topNiches: TopNicheDto[];

  @ApiProperty({
    description: "Trending videos with high performance",
    type: [TrendingVideoDto],
  })
  @IsArray()
  @Type(() => TrendingVideoDto)
  trendingVideos: TrendingVideoDto[];

  @ApiProperty({
    description: "Timestamp when analysis was performed",
    example: "2025-01-19T20:30:00.000Z",
  })
  @Type(() => Date)
  @IsDate()
  timestamp: Date;
}

export class NicheMetricsDto {
  @ApiProperty({
    description: "Total number of videos in the niche",
    example: 450,
    minimum: 0,
  })
  @IsNumber()
  totalVideos: number;

  @ApiProperty({
    description: "Total views across all videos in the niche",
    example: 2500000,
    minimum: 0,
  })
  @IsNumber()
  totalViews: number;

  @ApiProperty({
    description: "Total likes across all videos in the niche",
    example: 125000,
    minimum: 0,
  })
  @IsNumber()
  totalLikes: number;

  @ApiProperty({
    description: "Total comments across all videos in the niche",
    example: 15000,
    minimum: 0,
  })
  @IsNumber()
  totalComments: number;

  @ApiProperty({
    description: "Average engagement rate for the niche",
    example: 4.2,
    minimum: 0,
  })
  @IsNumber()
  avgEngagementRate: number;

  @ApiProperty({
    description: "Average virality score for the niche",
    example: 65.5,
    minimum: 0,
    maximum: 100,
  })
  @IsNumber()
  avgViralityScore: number;
}

export class TopVideoDto {
  @ApiProperty({
    description: "YouTube video ID",
    example: "dQw4w9WgXcQ",
  })
  @IsString()
  videoId: string;

  @ApiProperty({
    description: "Video title",
    example: "Best Fitness Workout for Beginners",
  })
  @IsString()
  title: string;

  @ApiProperty({
    description: "Channel name",
    example: "Fitness Pro",
  })
  @IsString()
  channelTitle: string;

  @ApiProperty({
    description: "View count",
    example: 85000,
    minimum: 0,
  })
  @IsNumber()
  views: number;

  @ApiProperty({
    description: "Engagement rate percentage",
    example: 6.8,
    minimum: 0,
  })
  @IsNumber()
  engagementRate: number;

  @ApiProperty({
    description: "Virality score (0-100)",
    example: 82,
    minimum: 0,
    maximum: 100,
  })
  @IsNumber()
  viralityScore: number;
}

export class TopChannelDto {
  @ApiProperty({
    description: "YouTube channel ID",
    example: "UC1234567890",
  })
  @IsString()
  channelId: string;

  @ApiProperty({
    description: "Number of videos from this channel",
    example: 15,
    minimum: 0,
  })
  @IsNumber()
  videoCount: number;

  @ApiProperty({
    description: "Total views across all videos from this channel",
    example: 450000,
    minimum: 0,
  })
  @IsNumber()
  totalViews: number;

  @ApiProperty({
    description: "Average views per video",
    example: 30000,
    minimum: 0,
  })
  @IsNumber()
  avgViews: number;
}

export class ContentIdeaDto {
  @ApiProperty({
    description: "Content idea title",
    example: "10-Minute Morning Workout Routine",
  })
  @IsString()
  title: string;

  @ApiProperty({
    description: "Detailed description of the content idea",
    example: "A quick morning workout that targets all major muscle groups",
  })
  @IsString()
  description: string;

  @ApiProperty({
    description: "Potential performance score (0-100)",
    example: 85,
    minimum: 0,
    maximum: 100,
  })
  @IsNumber()
  potentialScore: number;

  @ApiProperty({
    description: "Related videos that inspired this idea",
    type: [TopVideoDto],
  })
  @IsArray()
  @Type(() => TopVideoDto)
  relatedVideos: TopVideoDto[];

  @ApiProperty({
    description: "Recommended hashtags for this content",
    example: ["#fitness", "#workout", "#morningroutine"],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  hashtags: string[];
}

export class PostingTimeAnalysisDto {
  @ApiProperty({
    description: "Hour of day (0-23)",
    example: 18,
    minimum: 0,
    maximum: 23,
  })
  @IsNumber()
  hour: number;

  @ApiProperty({
    description: "Average engagement rate for this hour",
    example: 4.8,
    minimum: 0,
  })
  @IsNumber()
  avgEngagement: number;

  @ApiProperty({
    description: "Number of videos analyzed for this hour",
    example: 25,
    minimum: 0,
  })
  @IsNumber()
  sampleSize: number;
}

export class DataSourceDto {
  @ApiProperty({
    description: "Number of videos from database",
    example: 150,
    minimum: 0,
  })
  @IsNumber()
  database: number;

  @ApiProperty({
    description: "Number of videos from real-time API",
    example: 25,
    minimum: 0,
  })
  @IsNumber()
  realTime: number;

  @ApiProperty({
    description: "Total combined videos analyzed",
    example: 175,
    minimum: 0,
  })
  @IsNumber()
  combined: number;

  @ApiProperty({
    description: "Data reliability score (0-1)",
    example: 0.85,
    minimum: 0,
    maximum: 1,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  reliability?: number;
}

export class NicheAnalysisResponseDto {
  @ApiProperty({
    description: "Content niche being analyzed",
    example: "fitness",
  })
  @IsString()
  niche: string;

  @ApiProperty({
    description: "Overall metrics for the niche",
    type: NicheMetricsDto,
  })
  @Type(() => NicheMetricsDto)
  metrics: NicheMetricsDto;

  @ApiProperty({
    description: "Top performing videos in the niche",
    type: [TopVideoDto],
  })
  @IsArray()
  @Type(() => TopVideoDto)
  topVideos: TopVideoDto[];

  @ApiProperty({
    description: "Top performing channels in the niche",
    type: [TopChannelDto],
  })
  @IsArray()
  @Type(() => TopChannelDto)
  topChannels: TopChannelDto[];

  @ApiProperty({
    description: "Trending hashtags in the niche",
    type: [TopHashtagDto],
  })
  @IsArray()
  @Type(() => TopHashtagDto)
  trendingHashtags: TopHashtagDto[];

  @ApiProperty({
    description: "Generated content ideas for the niche",
    type: [ContentIdeaDto],
  })
  @IsArray()
  @Type(() => ContentIdeaDto)
  contentIdeas: ContentIdeaDto[];

  @ApiProperty({
    description: "Optimal posting time analysis",
    type: [PostingTimeAnalysisDto],
  })
  @IsArray()
  @Type(() => PostingTimeAnalysisDto)
  postingTimeAnalysis: PostingTimeAnalysisDto[];

  @ApiProperty({
    description: "Timestamp when analysis was last updated",
    example: "2025-01-19T20:30:00.000Z",
  })
  @Type(() => Date)
  @IsDate()
  lastUpdated: Date;

  @ApiProperty({
    description: "Data source information",
    type: DataSourceDto,
    required: false,
  })
  @IsOptional()
  @Type(() => DataSourceDto)
  dataSource?: DataSourceDto;
}

export class CrossNicheComparisonDto {
  @ApiProperty({
    description: "Date when comparison was performed",
    example: "2025-01-19T20:30:00.000Z",
  })
  @Type(() => Date)
  @IsDate()
  comparisonDate: Date;

  @ApiProperty({
    description: "Ranked niches with performance metrics",
    type: [NicheAnalysisResponseDto],
  })
  @IsArray()
  @Type(() => NicheAnalysisResponseDto)
  niches: NicheAnalysisResponseDto[];

  @ApiProperty({
    description: "Strategic insights from the comparison",
    example: [
      "Fitness niche shows highest engagement rates",
      "Gaming niche has the most consistent performance",
      "Tech niche is growing rapidly in viewership",
    ],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  insights: string[];
}
