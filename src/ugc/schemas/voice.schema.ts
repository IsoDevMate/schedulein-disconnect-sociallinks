import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

@Schema({ timestamps: true })
export class Voice extends Document {
  @Prop({ required: true })
  userId: string;

  @Prop({ required: false })
  scriptId: string;

  @Prop({ required: true })
  voiceId: string;

  @Prop({ required: true })
  sampleUrl: string;

  @Prop({ required: true })
  language: string;
}

export const VoiceSchema = SchemaFactory.createForClass(Voice);
