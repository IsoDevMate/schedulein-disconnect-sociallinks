import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Schema as MongooseSchema } from "mongoose";

export type HashtagAnalyticsDocument = HashtagAnalytics & Document;

@Schema({ timestamps: true, collection: "youtube_hashtag_analytics" })
export class HashtagAnalytics {
  @Prop({ required: true, lowercase: true })
  hashtag: string;

  @Prop({ default: 0 })
  totalVideos: number;

  @Prop({ default: 0 })
  totalViews: number;

  @Prop({ default: 0 })
  totalLikes: number;

  @Prop({ default: 0 })
  totalComments: number;

  @Prop({ default: 0 })
  averageEngagementRate: number;

  @Prop({ default: 0 })
  averageViralityScore: number;

  @Prop({ type: [String], default: [] })
  topVideos: string[]; // Array of videoIds

  @Prop({ type: [String], default: [] })
  relatedHashtags: string[];

  @Prop({ type: Object, default: {} })
  dailyMetrics: {
    [date: string]: {
      videoCount: number;
      viewCount: number;
      likeCount: number;
      commentCount: number;
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
  topChannels: string[];

  @Prop({ type: [String], default: [] })
  topNiches: string[];
}

export const HashtagAnalyticsSchema =
  SchemaFactory.createForClass(HashtagAnalytics);

// Indexes for faster queries
HashtagAnalyticsSchema.index({ hashtag: 1 }, { unique: true });
HashtagAnalyticsSchema.index({ averageEngagementRate: -1 });
HashtagAnalyticsSchema.index({ totalVideos: -1 });
HashtagAnalyticsSchema.index({ totalViews: -1 });
