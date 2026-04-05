import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose from 'mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class Agency extends Document {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  linkedInCompanyId: string;

  @Prop({ required: true })
  linkedInCompanyPageId: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true })
  adminId: string;

  @Prop({ type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }] })
  members: string[];

  @Prop({ type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }] })
  pendingInvites: string[];
}

export const AgencySchema = SchemaFactory.createForClass(Agency);