import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Schema as MongooseSchema } from "mongoose";

export enum SubscriptionPlan {
  BASIC = "basic",
  PREMIUM = "premium",
  ENTERPRISE = "enterprise",
}

export enum SubscriptionStatus {
  ACTIVE = "active",
  CANCELLED = "cancelled",
  EXPIRED = "expired",
  PENDING = "pending",
}

@Schema({ timestamps: true })
export class Subscription extends Document {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "User", required: true })
  userId: string;

  @Prop({
    type: String,
    enum: SubscriptionPlan,
    default: SubscriptionPlan.BASIC,
  })
  plan: SubscriptionPlan;

  @Prop({
    type: String,
    enum: SubscriptionStatus,
    default: SubscriptionStatus.PENDING,
  })
  status: SubscriptionStatus;

  @Prop({ required: true })
  paystackSubscriptionId: string;

  @Prop({ required: true })
  paystackCustomerId: string;

  @Prop()
  paystackPaymentReference: string;

  @Prop({ required: true })
  amount: number;

  @Prop({ required: true })
  currency: string;

  @Prop({ required: true })
  interval: string; // monthly, yearly

  @Prop({ required: true })
  nextPaymentDate: Date;
}

export const SubscriptionSchema = SchemaFactory.createForClass(Subscription);
