import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Schema as MongooseSchema } from "mongoose";

export type NicheAnalyticsDocument = NicheAnalytics & Document;

@Schema({ timestamps: true, collection: "youtube_niche_analytics" })
export class NicheAnalytics {
  @Prop({ required: true, lowercase: true })
  name: string;

  @Prop({ default: 0 })
  totalVideos: number;

  @Prop({ default: 0 })
  totalViews: number;

  @Prop({ default: 0 })
  totalLikes: number;

  @Prop({ default: 0 })
  averageEngagementRate: number;

  @Prop({ default: 0 })
  averageViralityScore: number;

  @Prop({ type: [String], default: [] })
  topHashtags: string[];

  @Prop({ type: [String], default: [] })
  topVideos: string[];

  @Prop({ type: [String], default: [] })
  topChannels: string[];

  @Prop({ type: Object, default: {} })
  metricsHistory: {
    [date: string]: {
      videoCount: number;
      viewCount: number;
      likeCount: number;
      commentCount: number;
      averageEngagement: number;
    };
  };

  @Prop({ type: Object, default: {} })
  hourlyPerformance: {
    [hour: string]: {
      averageViews: number;
      averageEngagement: number;
      sampleSize: number;
    };
  };

  @Prop({ type: [String], default: [] })
  relatedNiches: string[];

  @Prop({ type: Object, default: {} })
  sentimentAnalysis: {
    positive: number;
    neutral: number;
    negative: number;
    lastUpdated: Date;
  };

  @Prop({ type: [String], default: [] })
  trendingTopics: string[];

  @Prop({ type: Object, default: {} })
  contentIdeas: {
    [date: string]: {
      topic: string;
      potentialScore: number;
      relatedHashtags: string[];
      sampleVideos: string[];
    }[];
  };
}

export const NicheAnalyticsSchema =
  SchemaFactory.createForClass(NicheAnalytics);

// Indexes for faster queries
NicheAnalyticsSchema.index({ name: 1 }, { unique: true });
NicheAnalyticsSchema.index({ averageEngagementRate: -1 });
NicheAnalyticsSchema.index({ totalVideos: -1 });
NicheAnalyticsSchema.index({ trendingTopics: "text" });
