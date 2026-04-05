import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

export enum TikTokPostStatus {
  PENDING = "pending",
  PROCESSING = "processing",
  PUBLISHED = "published",
  FAILED = "failed",
}

export enum TikTokPostType {
  PERSONAL = "personal",
  BUSINESS = "business",
}

@Schema({ timestamps: true })
export class TikTokPost extends Document {
  @Prop({ required: true })
  userId: string;

  @Prop({ required: true })
  content: string;

  @Prop({ required: true })
  scheduledTime: Date;

  @Prop()
  mediaUrl: string;

  @Prop()
  publishId: string;

  @Prop({
    type: String,
    enum: TikTokPostStatus,
    default: TikTokPostStatus.PENDING,
  })
  status: TikTokPostStatus;

  @Prop({
    type: String,
    enum: TikTokPostType,
    default: TikTokPostType.PERSONAL,
  })
  postType: TikTokPostType;

  @Prop()
  lastError: string;

  @Prop()
  publishedAt: Date;

  @Prop()
  title: string;

  @Prop()
  description: string;

  @Prop()
  privacyLevel: string;

  @Prop({ default: false })
  disableComment: boolean;

  @Prop({ default: false })
  disableDuet: boolean;

  @Prop({ default: false })
  disableStitch: boolean;
}

export const TikTokPostSchema = SchemaFactory.createForClass(TikTokPost);
