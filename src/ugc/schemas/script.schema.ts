import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

@Schema({ timestamps: true })
export class Script extends Document {
  @Prop({ required: true })
  userId: string;

  @Prop({ required: true })
  prompt: string;

  @Prop({ required: true })
  text: string;

  @Prop({ required: true })
  language: string;

  @Prop({ default: "promotional" })
  style: string;

  @Prop({ type: [String], default: [] })
  keywords: string[];

  @Prop({ default: false })
  isUsed: boolean;
}

export const ScriptSchema = SchemaFactory.createForClass(Script);
