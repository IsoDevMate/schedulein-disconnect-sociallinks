import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

@Schema({ timestamps: true })
export class Image extends Document {
  @Prop({ required: true })
  userId: string;

  @Prop({ required: true })
  magicHourId: string;

  @Prop({ type: [String], default: [] })
  s3Urls: string[];
}

export const ImageSchema = SchemaFactory.createForClass(Image);
