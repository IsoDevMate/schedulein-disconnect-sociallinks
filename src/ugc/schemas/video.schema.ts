import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

@Schema({ timestamps: true })
export class Video extends Document {
  @Prop({ required: true })
  userId: string;

  @Prop({ required: true })
  scriptId: string;

  @Prop({ required: true })
  avatarId: string;

  @Prop({ required: true })
  voiceId: string;

  @Prop({ required: true })
  videoUrl: string;

  @Prop()
  videoId?: string;

  @Prop({ default: "processing" })
  status: string;

  @Prop({ required: true })
  length: number;

  @Prop({ required: true })
  language: string;
}

export const VideoSchema = SchemaFactory.createForClass(Video);
