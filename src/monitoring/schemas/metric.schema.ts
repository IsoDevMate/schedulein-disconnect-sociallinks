import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type MetricDocument = Metric & Document;

export enum MetricType {
  HTTP_REQUEST = 'http_request',
  HTTP_ERROR = 'http_error',
  CACHE_METRIC = 'cache_metric',
  SYSTEM_METRIC = 'system_metric',
  CUSTOM_METRIC = 'custom_metric',
}

@Schema({ timestamps: true, collection: 'metrics' })
export class Metric {
  @Prop({ type: String, required: true, enum: Object.values(MetricType) })
  type: MetricType;

  @Prop({ type: String, required: true })
  name: string;

  @Prop({ type: Object, default: {} })
  tags: Record<string, string>;

  @Prop({ type: Object, default: {} })
  fields: Record<string, any>;

  @Prop({ type: Date, default: Date.now })
  timestamp: Date;
}

export const MetricSchema = SchemaFactory.createForClass(Metric);

// Add indexes for common query patterns
MetricSchema.index({ type: 1, timestamp: -1 });
MetricSchema.index({ 'tags.path': 1, timestamp: -1 });
MetricSchema.index({ 'tags.status': 1, timestamp: -1 });
