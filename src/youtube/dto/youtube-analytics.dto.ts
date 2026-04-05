import { ApiProperty } from "@nestjs/swagger";
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
} from "class-validator";

export class ShortsMetricsDto {
  @ApiProperty({ description: "YouTube Shorts video ID" })
  @IsString()
  videoId: string;

  @ApiProperty({ description: "Shorts title" })
  @IsString()
  title: string;

  @ApiProperty({ description: "Shorts description", required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ description: "Number of views" })
  @IsNumber()
  viewCount: number;

  @ApiProperty({ description: "Number of likes" })
  @IsNumber()
  likeCount: number;

  @ApiProperty({ description: "Number of comments" })
  @IsNumber()
  commentCount: number;

  @ApiProperty({ description: "Engagement rate (likes + comments / views)" })
  @IsNumber()
  engagementRate: number;

  @ApiProperty({ description: "Shorts published date", type: Date })
  @IsDateString()
  publishedAt: string;

  @ApiProperty({ description: "Shorts thumbnail URL" })
  @IsString()
  thumbnail: string;

  @ApiProperty({ description: "Shorts duration in seconds (max 60s)" })
  @IsNumber()
  duration: number;

  @ApiProperty({ description: "Channel ID of the Shorts creator" })
  @IsString()
  channelId: string;

  @ApiProperty({ description: "Channel title" })
  @IsString()
  channelTitle: string;

  @ApiProperty({ description: "Shorts URL" })
  @IsString()
  url: string;

  @ApiProperty({ description: "Whether this is a Shorts video", default: true })
  @IsBoolean()
  isShorts = true;

  @ApiProperty({ description: "View to like ratio (views/likes)" })
  @IsNumber()
  viewToLikeRatio: number;
}

export class ChannelShortsAnalyticsDto {
  @ApiProperty({ description: "Channel ID" })
  @IsString()
  channelId: string;

  @ApiProperty({ description: "Channel title" })
  @IsString()
  channelTitle: string;

  @ApiProperty({ description: "Number of subscribers" })
  @IsNumber()
  subscriberCount: number;

  @ApiProperty({ description: "Total Shorts views" })
  @IsNumber()
  totalShortsViews: number;

  @ApiProperty({ description: "Total number of Shorts" })
  @IsNumber()
  shortsCount: number;

  @ApiProperty({ description: "Average engagement rate across all Shorts" })
  @IsNumber()
  averageEngagementRate: number;

  @ApiProperty({ description: "Average views per Short" })
  @IsNumber()
  averageViewsPerShort: number;

  @ApiProperty({ description: "Date when analytics were last updated" })
  @IsDateString()
  lastUpdated: string;
}

export class ChannelShortsResponseDto {
  @ApiProperty({ description: "Channel ID" })
  @IsString()
  channelId: string;

  @ApiProperty({ description: "Total number of Shorts found" })
  @IsNumber()
  totalShorts: number;

  @ApiProperty({ description: "Average views across all Shorts" })
  @IsNumber()
  averageViews: number;

  @ApiProperty({ description: "Average likes across all Shorts" })
  @IsNumber()
  averageLikes: number;

  @ApiProperty({ description: "Average engagement rate across all Shorts" })
  @IsNumber()
  averageEngagementRate: number;

  @ApiProperty({
    type: [ShortsMetricsDto],
    description: "Array of Shorts metrics",
  })
  @IsArray()
  shorts: ShortsMetricsDto[];

  @ApiProperty({ description: "Timestamp of when the data was last updated" })
  @IsString()
  lastUpdated: string;
}

export class ShortsAnalyticsResponseDto {
  @ApiProperty({ type: [ShortsMetricsDto] })
  @IsArray()
  shorts: ShortsMetricsDto[];

  @ApiProperty({ type: ChannelShortsAnalyticsDto })
  @IsObject()
  channel: ChannelShortsAnalyticsDto;

  @ApiProperty({ description: "Total views across all Shorts" })
  @IsNumber()
  totalViews: number;

  @ApiProperty({ description: "Total engagement (likes + comments)" })
  @IsNumber()
  totalEngagement: number;

  @ApiProperty({ description: "Average engagement rate across all Shorts" })
  @IsNumber()
  averageEngagementRate: number;

  @ApiProperty({ description: "Date range of the analytics data" })
  @IsObject()
  dateRange: {
    start: string;
    end: string;
  };
}

export class TimeRangeDto {
  @ApiProperty({ description: "Start date (ISO string)", required: false })
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @ApiProperty({ description: "End date (ISO string)", required: false })
  @IsDateString()
  @IsOptional()
  endDate?: string;
}
