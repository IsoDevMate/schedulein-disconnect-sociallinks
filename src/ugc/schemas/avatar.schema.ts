import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

@Schema({ timestamps: true })
export class Avatar extends Document {
  @Prop({ required: true })
  userId: string;

  @Prop({ required: true })
  avatarId: string;

  @Prop({ required: true })
  avatarName: string;

  @Prop({ required: true })
  photoUrl: string;

  @Prop({ type: Object, default: {} })
  features: Record<string, any>;

  @Prop({ required: true })
  language: string;

  @Prop({ required: true })
  thumbnailUrl: string;
}

export const AvatarSchema = SchemaFactory.createForClass(Avatar);
