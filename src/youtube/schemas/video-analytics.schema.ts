import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type VideoAnalyticsDocument = VideoAnalytics & Document;

@Schema({ timestamps: true, collection: 'youtube_video_analytics' })
export class VideoAnalytics {
  @Prop({ required: true })
  userId: string;

  @Prop({ required: true })
  videoId: string;

  @Prop({ required: true })
  title: string;

  @Prop({ default: '' })
  description: string;

  @Prop({ required: true })
  channelId: string;

  @Prop({ required: true })
  channelTitle: string;

  @Prop({ required: true })
  publishedAt: Date;

  @Prop({ default: 0 })
  viewCount: number;

  @Prop({ default: 0 })
  likeCount: number;

  @Prop({ default: 0 })
  commentCount: number;

  @Prop({ default: 0 })
  engagementRate: number;

  @Prop({ default: 0 })
  viewToLikeRatio: number;

  @Prop({ default: 0 })
  viralityScore: number;

  @Prop({ type: [String], default: [] })
  hashtags: string[];

  @Prop({ type: [String], default: [] })
  topics: string[];

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop({ default: '' })
  categoryId: string;

  @Prop({ default: '' })
  thumbnailUrl: string;

  @Prop({ default: 0 })
  duration: number;

  @Prop({ default: '' })
  niche: string;


  @Prop({ default: false })
  isShorts: boolean;

  @Prop({ type: Object, default: {} })
  metricsHistory: {
    [key: string]: {
      viewCount: number;
      likeCount: number;
      commentCount: number;
      engagementRate: number;
      timestamp: Date;
    };
  };

  @Prop({ type: Object, default: {} })
  hourlyPerformance: {
    [hour: string]: {
      views: number;
      likes: number;
      comments: number;
    };
  };
}

export const VideoAnalyticsSchema = SchemaFactory.createForClass(VideoAnalytics);

// Indexes for faster queries
VideoAnalyticsSchema.index({ videoId: 1 }, { unique: true });
VideoAnalyticsSchema.index({ channelId: 1 });
VideoAnalyticsSchema.index({ publishedAt: -1 });
VideoAnalyticsSchema.index({ viralityScore: -1 });
VideoAnalyticsSchema.index({ niche: 1 });
VideoAnalyticsSchema.index({ 'hashtags': 'text', 'topics': 'text', 'title': 'text', 'description': 'text' });
