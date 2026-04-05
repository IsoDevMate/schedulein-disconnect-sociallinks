import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Schema as MongooseSchema } from "mongoose";

export type CompetitorAnalysisDocument = CompetitorAnalysis & Document;
@Schema({ timestamps: true, collection: "youtube_competitor_analysis" })
export class CompetitorAnalysis {
  @Prop({ required: true })
  niche: string;

  @Prop({ required: true })
  totalCompetitors: number;

  @Prop({ type: Object, required: true })
  averageMetrics: {
    views: number;
    engagementRate: number;
    postingFrequency: number;
    growthRate: number;
  };

  @Prop({ type: [Object], default: [] })
  topCompetitors: Array<{
    channelId: string;
    channelTitle: string;
    niche: string;
    totalVideos: number;
    totalViews: number;
    averageViews: number;
    averageEngagementRate: number;
    postingFrequency: number;
    growthRate: number;
    topPerformingVideos: Array<{
      videoId: string;
      title: string;
      views: number;
      engagementRate: number;
      publishedAt: Date;
    }>;
    contentThemes: string[];
    hashtagStrategy: string[];
    postingSchedule: {
      bestDays: string[];
      bestHours: number[];
      timezone: string;
    };
    strengths: string[];
    weaknesses: string[];
    lastUpdated: Date;
  }>;

  @Prop({ type: [Object], default: [] })
  marketGaps: Array<{
    topic: string;
    opportunity: "low" | "medium" | "high";
    reason: string;
  }>;

  @Prop({ type: [String], default: [] })
  strategicRecommendations: string[];

  @Prop({ required: true })
  lastUpdated: Date;
}

export const CompetitorAnalysisSchema =
  SchemaFactory.createForClass(CompetitorAnalysis);

// Indexes for faster queries
CompetitorAnalysisSchema.index({ niche: 1 });
CompetitorAnalysisSchema.index({ lastUpdated: -1 });
CompetitorAnalysisSchema.index({ "averageMetrics.views": -1 });
