import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Types } from "mongoose";

export enum GoalType {
  FOLLOWERS = "followers",
  VIEWS = "views",
  ENGAGEMENT_RATE = "engagement_rate",
  POSTING_FREQUENCY = "posting_frequency",
  LIKES = "likes",
  COMMENTS = "comments",
  SHARES = "shares",
  REVENUE = "revenue",
}

export enum GoalStatus {
  ACTIVE = "active",
  COMPLETED = "completed",
  FAILED = "failed",
  PAUSED = "paused",
}

@Schema({ timestamps: true })
export class UserGoal extends Document {
  @Prop({ type: Types.ObjectId, ref: "User", required: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: "AccountConnect" })
  accountId: Types.ObjectId;

  @Prop({ required: true })
  title: string;

  @Prop()
  description: string;

  @Prop({ type: String, enum: GoalType, required: true })
  type: GoalType;

  @Prop({ required: true })
  targetValue: number;

  @Prop({ required: true })
  currentValue: number;

  @Prop({ required: true })
  startDate: Date;

  @Prop({ required: true })
  targetDate: Date;

  @Prop({ type: String, enum: GoalStatus, default: GoalStatus.ACTIVE })
  status: GoalStatus;

  @Prop({ type: [String] })
  platforms: string[];

  @Prop({ type: Object })
  progressHistory: {
    date: Date;
    value: number;
    percentage: number;
  }[];

  @Prop({ default: false })
  isRecurring: boolean;

  @Prop()
  recurringInterval: string; // daily, weekly, monthly

  @Prop({ type: [String] })
  tags: string[];

  @Prop({ default: 0 })
  completionPercentage: number;

  @Prop()
  lastUpdated: Date;
}

export const UserGoalSchema = SchemaFactory.createForClass(UserGoal);

// Indexes for better query performance
UserGoalSchema.index({ userId: 1, status: 1 });
UserGoalSchema.index({ userId: 1, type: 1 });
UserGoalSchema.index({ targetDate: 1 });
UserGoalSchema.index({ accountId: 1 });
