import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema()
export class Notification extends Document {
  @Prop({ required: true })
  userId: string;

  @Prop({ required: true })
  message: string;

  // @Prop({ required: true })
  // email: string;

  @Prop({ required: true })
  timestamp: Date;

  @Prop({ required: true })
  type: string; // e.g., 'post_published', 'post_reminder'
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);
