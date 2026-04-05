import { Injectable, BadRequestException, Inject, forwardRef } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { ConfigService } from "@nestjs/config";
import axios from "axios";
import {
  Subscription,
  SubscriptionPlan,
  SubscriptionStatus,
} from "./entities/subscription.entity";
import { CreateSubscriptionDto } from "./dto/create-subscription.dto";
import { V2CreditsService } from "../v2/credits/services/v2-credits.service";
import { V2SubscriptionPlan } from "../v2/credits/enums/v2-subscription-plan.enum";

@Injectable()
export class SubscriptionService {
  private readonly paystackSecretKey: string;
  private readonly paystackBaseUrl: string;

  constructor(
    @InjectModel(Subscription.name)
    private subscriptionModel: Model<Subscription>,
    private configService: ConfigService,
    @Inject(forwardRef(() => V2CreditsService))
    private v2CreditsService: V2CreditsService,
  ) {
    this.paystackSecretKey = this.configService.get<string>(
      "PAYSTACK_SECRET_KEY",
    );
    this.paystackBaseUrl = "https://api.paystack.co";
  }

  async createSubscription(
    userId: string,
    plan: SubscriptionPlan,
    email: string,
  ): Promise<{ subscriptionUrl: string }> {
    // Create a customer in Paystack
    const customerResponse = await axios.post(
      `${this.paystackBaseUrl}/customer`,
      { email },
      {
        headers: {
          Authorization: `Bearer ${this.paystackSecretKey}`,
        },
      },
    );

    const customerId = customerResponse.data.data.customer_code;

    // Create a subscription plan in Paystack
    const planResponse = await axios.post(
      `${this.paystackBaseUrl}/plan`,
      {
        name: `${plan} Plan`,
        interval: "monthly",
        amount: this.getPlanAmount(plan) * 100, // Convert to kobo
        currency: "NGN",
      },
      {
        headers: {
          Authorization: `Bearer ${this.paystackSecretKey}`,
        },
      },
    );

    const planId = planResponse.data.data.plan_code;

    // Initialize subscription
    const subscriptionResponse = await axios.post(
      `${this.paystackBaseUrl}/subscription`,
      {
        customer: customerId,
        plan: planId,
      },
      {
        headers: {
          Authorization: `Bearer ${this.paystackSecretKey}`,
        },
      },
    );

    // Create subscription record in our database
    await this.subscriptionModel.create({
      userId,
      plan,
      status: SubscriptionStatus.PENDING,
      paystackSubscriptionId: subscriptionResponse.data.data.subscription_code,
      paystackCustomerId: customerId,
      amount: this.getPlanAmount(plan),
      currency: "NGN",
      interval: "monthly",
      nextPaymentDate: new Date(
        subscriptionResponse.data.data.next_payment_date,
      ),
    });

    return {
      subscriptionUrl: subscriptionResponse.data.data.authorization_url,
    };
  }

  async handleSubscriptionWebhook(data: any): Promise<void> {
    const { subscription_code, status } = data;

    const subscription = await this.subscriptionModel.findOne({
      paystackSubscriptionId: subscription_code,
    });

    if (!subscription) {
      throw new BadRequestException("Subscription not found");
    }

    if (status === "active") {
      subscription.status = SubscriptionStatus.ACTIVE;

      // Allocate V2 credits when subscription becomes active
      const v2Plan = this.mapToV2Plan(subscription.plan);
      await this.v2CreditsService.allocateMonthlyCredits(
        subscription.userId,
        v2Plan,
        subscription.paystackSubscriptionId
      );
    } else if (status === "cancelled") {
      subscription.status = SubscriptionStatus.CANCELLED;
    }

    await subscription.save();
  }

  /**
   * Map legacy subscription plans to V2 subscription plans
   */
  private mapToV2Plan(legacyPlan: SubscriptionPlan): V2SubscriptionPlan {
    const planMapping = {
      [SubscriptionPlan.BASIC]: V2SubscriptionPlan.CREATOR,
      [SubscriptionPlan.PREMIUM]: V2SubscriptionPlan.PRO,
      [SubscriptionPlan.ENTERPRISE]: V2SubscriptionPlan.PRO,
    };

    return planMapping[legacyPlan] || V2SubscriptionPlan.FREE;
  }

  private getPlanAmount(plan: SubscriptionPlan): number {
    switch (plan) {
      case SubscriptionPlan.BASIC:
        return 5000; // ₦5,000
      case SubscriptionPlan.PREMIUM:
        return 10000; // ₦10,000
      case SubscriptionPlan.ENTERPRISE:
        return 20000; // ₦20,000
      default:
        return 5000;
    }
  }

  async create(userId: string, createSubscriptionDto: CreateSubscriptionDto) {
    const subscription = new this.subscriptionModel({
      userId,
      plan: createSubscriptionDto.plan,
      status: "active",
      startDate: new Date(),
      endDate: this.calculateEndDate(createSubscriptionDto.plan),
    });

    return subscription.save();
  }

  async findAll(userId: string) {
    return this.subscriptionModel.find({ userId }).exec();
  }

  private calculateEndDate(plan: SubscriptionPlan): Date {
    const date = new Date();
    switch (plan) {
      case SubscriptionPlan.BASIC:
        date.setMonth(date.getMonth() + 1);
        break;
      case SubscriptionPlan.PREMIUM:
        date.setMonth(date.getMonth() + 3);
        break;
      case SubscriptionPlan.ENTERPRISE:
        date.setFullYear(date.getFullYear() + 1);
        break;
      default:
        date.setMonth(date.getMonth() + 1);
    }
    return date;
  }

  /**
   * Create subscription record for successful payment
   */
  async createSubscriptionRecord(
    userId: string,
    plan: SubscriptionPlan,
    email: string,
    paymentReference: string
  ): Promise<void> {
    try {
      // Check if subscription already exists for this payment
      const existingSubscription = await this.subscriptionModel.findOne({
        userId,
        paystackPaymentReference: paymentReference
      });

      if (existingSubscription) {
        return; // Already created
      }

      // Create subscription record
      await this.subscriptionModel.create({
        userId,
        plan,
        status: SubscriptionStatus.ACTIVE,
        paystackPaymentReference: paymentReference,
        amount: this.getPlanAmount(plan),
        currency: "NGN",
        interval: "monthly",
        nextPaymentDate: this.calculateEndDate(plan),
        createdAt: new Date(),
        updatedAt: new Date()
      });

      console.log(`✅ Subscription created for user ${userId} with plan ${plan}`);
    } catch (error) {
      console.error(`❌ Failed to create subscription for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Allocate credits for successful payment
   */
  async allocateCreditsForPayment(
    userId: string,
    plan: SubscriptionPlan,
    paymentReference: string
  ): Promise<void> {
    try {
      // Map legacy plan to V2 plan
      const v2Plan = this.mapToV2Plan(plan);

      // Allocate credits using V2 credits service
      await this.v2CreditsService.allocateMonthlyCredits(
        userId,
        v2Plan,
        paymentReference
      );

      console.log(`✅ Credits allocated for user ${userId} with plan ${plan}`);
    } catch (error) {
      console.error(`❌ Failed to allocate credits for user ${userId}:`, error);
      throw error;
    }
  }
}

