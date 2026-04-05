import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { V2SubscriptionPlan } from '../enums/v2-subscription-plan.enum';

export type V2UserCreditsDocument = V2UserCredits & Document;

@Schema({ timestamps: true })
export class V2UserCredits {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true, unique: true })
  userId: string;

  // Credit balances
  @Prop({ default: 0 })
  profileScoutCredits: number;

  @Prop({ default: 0 })
  ideaSparkCredits: number;

  @Prop({ default: 0 })
  postCredits: number;

  // Plan information
  @Prop({
    type: String,
    enum: Object.values(V2SubscriptionPlan),
    default: V2SubscriptionPlan.FREE
  })
  currentPlan: V2SubscriptionPlan;

  // Platform connection limits
  @Prop({
    type: Object,
    default: () => ({
      tiktok: 1,
      youtube: 1,
      instagram: 0,
      linkedin: 0
    })
  })
  platformLimits: {
    tiktok: number;
    youtube: number;
    instagram: number;
    linkedin: number;
  };

  // User count limit (for team plans)
  @Prop({ default: 1 })
  userLimit: number;

  // Credit management
  @Prop({ default: Date.now })
  lastResetDate: Date;

  @Prop({ default: Date.now })
  nextResetDate: Date;

  @Prop({ default: 0 })
  totalCreditsUsed: number;

  // Subscription details
  @Prop({ required: false })
  subscriptionId?: string;

  @Prop({ required: false })
  paystackCustomerId?: string;

  @Prop({ required: false })
  paystackSubscriptionId?: string;

  // Feature flags
  @Prop({
    type: Object,
    default: () => ({
      viralRadarFeed: true,
      ideaVault: true,
      communityDiscord: true,
      standardSupport: true
    })
  })
  features: {
    viralRadarFeed: boolean;
    ideaVault: boolean;
    communityDiscord: boolean;
    standardSupport?: boolean;
    priorityEmailSupport?: boolean;
    priorityDiscordSupport?: boolean;
    nicheAnalyzerFullAccess?: boolean;
    teamCollaboration?: boolean;
  };

  // Usage tracking
  @Prop({
    type: Object,
    default: () => ({
      profileScout: 0,
      ideaSpark: 0,
      posts: 0
    })
  })
  monthlyUsage: {
    profileScout: number;
    ideaSpark: number;
    posts: number;
  };

  // Status
  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: false })
  isSuspended: boolean;

  @Prop({ required: false })
  suspensionReason?: string;

  // Mongoose timestamps (automatically added)
  createdAt: Date;
  updatedAt: Date;
}

export const V2UserCreditsSchema = SchemaFactory.createForClass(V2UserCredits);

// Indexes for performance
V2UserCreditsSchema.index({ userId: 1 });
V2UserCreditsSchema.index({ currentPlan: 1 });
V2UserCreditsSchema.index({ nextResetDate: 1 });
V2UserCreditsSchema.index({ isActive: 1 });
