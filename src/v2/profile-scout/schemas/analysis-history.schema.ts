import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AnalysisHistoryDocument = AnalysisHistory & Document;

export enum AnalysisStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

export enum AnalysisPlatform {
  YOUTUBE = 'youtube',
  TIKTOK = 'tiktok',
  INSTAGRAM = 'instagram'
}

@Schema({ timestamps: true })
export class AnalysisHistory {
  @Prop({ type: Types.ObjectId, required: true, ref: 'User' })
  userId: Types.ObjectId;

  @Prop({ type: String, enum: AnalysisPlatform, required: true })
  platform: AnalysisPlatform;

  @Prop({ type: String, required: true, trim: true })
  targetUsername: string;

  @Prop({ type: String, trim: true })
  targetChannelId?: string;

  @Prop({ type: String, enum: AnalysisStatus, default: AnalysisStatus.PENDING })
  status: AnalysisStatus;

  @Prop({ type: Date, default: Date.now })
  startedAt: Date;

  @Prop({ type: Date })
  completedAt?: Date;

  @Prop({ type: Number, default: 0 })
  progress: number; // 0-100

  @Prop({ type: String })
  errorMessage?: string;

  @Prop({ type: String })
  errorCode?: string;

  @Prop({ type: Object })
  requestData: Record<string, any>;

  @Prop({ type: Object })
  resultData?: Record<string, any>;

  @Prop({ type: Number, default: 0 })
  processingTimeMs: number;

  @Prop({ type: Number, default: 0 })
  apiCallsCount: number;

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop({ type: Boolean, default: false })
  isFavorite: boolean;

  @Prop({ type: String })
  notes?: string;

  @Prop({ type: Object, default: {} })
  metadata: Record<string, any>;

  // Timestamps (automatically added by Mongoose with timestamps: true)
  createdAt: Date;
  updatedAt: Date;
}

export const AnalysisHistorySchema = SchemaFactory.createForClass(AnalysisHistory);

// Indexes for efficient querying
AnalysisHistorySchema.index({ userId: 1, createdAt: -1 });
AnalysisHistorySchema.index({ userId: 1, platform: 1 });
AnalysisHistorySchema.index({ userId: 1, status: 1 });
AnalysisHistorySchema.index({ userId: 1, targetUsername: 1 });
AnalysisHistorySchema.index({ userId: 1, isFavorite: 1 });
AnalysisHistorySchema.index({ status: 1, createdAt: 1 }); // For background processing
AnalysisHistorySchema.index({ targetUsername: 1, platform: 1 }); // For duplicate detection
