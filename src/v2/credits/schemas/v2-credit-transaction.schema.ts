import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export enum V2CreditTransactionType {
  PROFILE_SCOUT = 'profileScout',
  IDEA_SPARK = 'ideaSpark',
  POST = 'post',
  ALLOCATION = 'allocation',
  PURCHASE = 'purchase',
  REFUND = 'refund',
  ADMIN_ADJUSTMENT = 'adminAdjustment'
}

export enum V2CreditTransactionStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

export type V2CreditTransactionDocument = V2CreditTransaction & Document;

@Schema({ timestamps: true })
export class V2CreditTransaction {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  userId: string;

  @Prop({
    type: String,
    enum: Object.values(V2CreditTransactionType),
    required: true
  })
  creditType: V2CreditTransactionType;

  @Prop({ required: true })
  amount: number; // positive for allocation/purchase, negative for consumption

  @Prop({ required: true })
  reason: string;

  @Prop({ required: false })
  apiEndpoint?: string;

  @Prop({
    type: String,
    enum: Object.values(V2CreditTransactionStatus),
    default: V2CreditTransactionStatus.COMPLETED
  })
  status: V2CreditTransactionStatus;

  // Additional metadata
  @Prop({ type: Object, required: false })
  metadata?: {
    requestId?: string;
    subscriptionId?: string;
    paymentReference?: string;
    platform?: string;
    contentId?: string;
    analysisType?: string;
    [key: string]: any;
  };

  // Credit balance after transaction
  @Prop({ required: false })
  balanceAfter?: number;

  // Related transaction (for refunds, adjustments)
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'V2CreditTransaction', required: false })
  relatedTransactionId?: string;

  // Admin information
  @Prop({ required: false })
  adminUserId?: string;

  @Prop({ required: false })
  adminNotes?: string;y

  // Timestamps
  @Prop({ default: Date.now })
  processedAt: Date;

  // Mongoose timestamps (automatically added)
  createdAt: Date;
  updatedAt: Date;
}

export const V2CreditTransactionSchema = SchemaFactory.createForClass(V2CreditTransaction);

// Indexes for performance and queries
V2CreditTransactionSchema.index({ userId: 1, createdAt: -1 });
V2CreditTransactionSchema.index({ creditType: 1 });
V2CreditTransactionSchema.index({ status: 1 });
V2CreditTransactionSchema.index({ createdAt: -1 });
V2CreditTransactionSchema.index({ userId: 1, creditType: 1, createdAt: -1 });
