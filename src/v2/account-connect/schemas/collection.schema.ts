import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CollectionDocument = Collection & Document;

@Schema({ timestamps: true })
export class Collection {
  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  userId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ trim: true })
  description?: string;

  @Prop({ default: 0 })
  itemCount: number;

  @Prop({ default: Date.now })
  lastUpdated: Date;

  @Prop({ default: true })
  isActive: boolean;
}

export const CollectionSchema = SchemaFactory.createForClass(Collection);
