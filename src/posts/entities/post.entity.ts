import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export enum PostMediaType {
  VIDEO = 'video',
  IMAGE = 'image',
  ARTICLE = 'article',
  NONE = 'none',
  CAROUSEL = 'carousel',
}

export enum PostType {
  PERSONAL = 'personal',
  ORGANIZATION = 'organization',
}

@Schema()
export class Post extends Document {
  @Prop({ required: true })
  userId: string;

  @Prop({ required: true, default: Date.now })
  timestamp: Date;

  @Prop()
  pageId?: string;

  @Prop({ required: true })
  content: string;

  @Prop({ enum: PostType, required: true })
  postType: PostType;

  @Prop({ enum: PostMediaType, required: true })
  postMedia: PostMediaType;

  @Prop()
  mediaUrl?: string;

  @Prop({ required: true })
  scheduledTime: Date;

  @Prop({ default: 'pending' })
  status: string;

  @Prop({ default: false })
  isApproved: boolean;

  @Prop({ default: null })
  approvedBy?: string;

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  description: string;

  @Prop()
  personUrn?: string;

  @Prop()
  organizationUrn?: string;

  @Prop()
  lastError?: string;

  @Prop()
  publishedAt?: Date;

  @Prop()
  publishedId?: string;

  @Prop()
  file?: string;

  @Prop([String])
  carouselUrls?: string[];

  @Prop({ type: [String] })
  mediaUrls?: string[];
}

export const PostSchema = SchemaFactory.createForClass(Post);
