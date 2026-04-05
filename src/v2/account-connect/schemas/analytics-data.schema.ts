import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Types } from "mongoose";

export enum AnalyticsMetric {
  VIEWS = "views",
  LIKES = "likes",
  COMMENTS = "comments",
  SHARES = "shares",
  FOLLOWERS = "followers",
  ENGAGEMENT_RATE = "engagement_rate",
  REACH = "reach",
  IMPRESSIONS = "impressions",
  CLICK_THROUGH_RATE = "click_through_rate",
  WATCH_TIME = "watch_time",
  SUBSCRIBERS = "subscribers",
}

export enum TimeRange {
  DAY = "day",
  WEEK = "week",
  MONTH = "month",
  QUARTER = "quarter",
  YEAR = "year",
}

@Schema({ timestamps: true })
export class AnalyticsData extends Document {
  @Prop({ type: Types.ObjectId, ref: "User", required: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: "AccountConnect", required: true })
  accountId: Types.ObjectId;

  @Prop({ required: true })
  platform: string;

  @Prop({ type: String, enum: AnalyticsMetric, required: true })
  metric: AnalyticsMetric;

  @Prop({ required: true })
  value: number;

  @Prop({ required: true })
  date: Date;

  @Prop({ type: String, enum: TimeRange, default: TimeRange.DAY })
  timeRange: TimeRange;

  @Prop({ type: Object })
  breakdown: {
    byHour?: { [key: string]: number };
    byDay?: { [key: string]: number };
    byWeek?: { [key: string]: number };
    byMonth?: { [key: string]: number };
    byContentType?: { [key: string]: number };
    byAudience?: { [key: string]: number };
  };

  @Prop({ type: Object })
  comparison: {
    previousPeriod?: number;
    percentageChange?: number;
    trend?: "up" | "down" | "stable";
  };

  @Prop({ type: [Object] })
  topContent: {
    contentId: string;
    title: string;
    url: string;
    thumbnailUrl: string;
    views: number;
    likes: number;
    comments: number;
    shares: number;
    engagementRate: number;
    publishedAt: Date;
  }[];

  @Prop({ type: [Object] })
  topHashtags: {
    hashtag: string;
    count: number;
    reach: number;
    engagement: number;
  }[];

  @Prop({ type: [Object] })
  postingTimes: {
    hour: number;
    day: string;
    performance: number;
    frequency: number;
  }[];

  @Prop({ type: Object })
  audienceInsights: {
    ageGroups?: { [key: string]: number };
    genders?: { [key: string]: number };
    locations?: { [key: string]: number };
    interests?: string[];
    activeHours?: { [key: string]: number };
  };

  @Prop({ type: Object })
  performanceMetrics: {
    averageViews: number;
    averageLikes: number;
    averageComments: number;
    averageShares: number;
    averageEngagementRate: number;
    bestPerformingHour: number;
    bestPerformingDay: string;
    optimalPostingFrequency: number;
  };

  @Prop()
  lastUpdated: Date;
}

export const AnalyticsDataSchema = SchemaFactory.createForClass(AnalyticsData);

// Indexes for better query performance
AnalyticsDataSchema.index({ userId: 1, accountId: 1, metric: 1, date: 1 });
AnalyticsDataSchema.index({ accountId: 1, metric: 1, date: 1 });
AnalyticsDataSchema.index({ platform: 1, metric: 1, date: 1 });
AnalyticsDataSchema.index({ date: 1 });
