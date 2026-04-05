import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Types } from "mongoose";

export type BookmarkDocument = Bookmark & Document;

export enum BookmarkType {
  VIDEO = "video",
  IDEA = "idea",
  SCRIPT = "script",
}


@Schema({ timestamps: true })
export class Bookmark extends Document {
  @Prop({ type: Types.ObjectId, ref: "User", required: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: "Collection", required: true })
  collectionId: Types.ObjectId;



  @Prop({ type: String, enum: BookmarkType, required: true })
  type: BookmarkType;


  @Prop({ required: true })
  title: string;

  @Prop()
  description: string;

  @Prop({ required: true })
  url: string;

  @Prop()
  thumbnailUrl: string;

  @Prop()
  platform: string; // youtube, tiktok, instagram, etc.

  @Prop()
  platformContentId: string;

  @Prop()
  creatorUsername: string;

  @Prop()
  creatorDisplayName: string;

  @Prop({ type: Object })
  metadata: {
    duration?: number;
    views?: number;
    likes?: number;
    comments?: number;
    shares?: number;
    hashtags?: string[];
    description?: string;
    publishedAt?: Date;
  };

  @Prop({ type: [String] })
  tags: string[];

  @Prop({ type: [String] })
  notes: string[];

  @Prop({ default: false })
  isFavorite: boolean;

  @Prop({ default: false })
  isProcessed: boolean; // for AI idea generation

  @Prop({ type: Object })
  aiAnalysis: {
    contentType?: string;
    style?: string;
    mood?: string;
    targetAudience?: string;
    keyElements?: string[];
    potentialIdeas?: string[];
    analyzedAt?: Date;
  };

  @Prop()
  lastViewed: Date;
}

export const BookmarkSchema = SchemaFactory.createForClass(Bookmark);

// Indexes for better query performance
BookmarkSchema.index({ userId: 1, type: 1 });
BookmarkSchema.index({ userId: 1, category: 1 });
BookmarkSchema.index({ userId: 1, isFavorite: 1 });
BookmarkSchema.index({ platformContentId: 1, platform: 1 });
BookmarkSchema.index({ tags: 1 });
BookmarkSchema.index({ isProcessed: 1 });
