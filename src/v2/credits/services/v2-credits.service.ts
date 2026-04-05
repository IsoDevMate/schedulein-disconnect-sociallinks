import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { V2UserCredits, V2UserCreditsDocument } from '../schemas/v2-user-credits.schema';
import { V2CreditTransaction, V2CreditTransactionDocument, V2CreditTransactionType, V2CreditTransactionStatus } from '../schemas/v2-credit-transaction.schema';
import { V2SubscriptionPlan, V2_PLAN_CREDITS } from '../enums/v2-subscription-plan.enum';

@Injectable()
export class V2CreditsService {
  constructor(
    @InjectModel(V2UserCredits.name) private creditsModel: Model<V2UserCreditsDocument>,
    @InjectModel(V2CreditTransaction.name) private transactionModel: Model<V2CreditTransactionDocument>,
  ) {}

  /**
   * Initialize credits for a new user
   */
  async initializeUserCredits(userId: string, plan: V2SubscriptionPlan = V2SubscriptionPlan.FREE): Promise<V2UserCreditsDocument> {
    const credits = V2_PLAN_CREDITS[plan];

    const userCredits = new this.creditsModel({
      userId,
      profileScoutCredits: credits.profileScout,
      ideaSparkCredits: credits.ideaSpark,
      postCredits: credits.postCredits === -1 ? 999999 : credits.postCredits,
      currentPlan: plan,
      platformLimits: credits.platformLimits,
      userLimit: credits.userLimit,
      features: credits.features,
      lastResetDate: new Date(),
      nextResetDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      monthlyUsage: {
        profileScout: 1,
        ideaSpark: 1,
        posts: 1
      }
    });

    const savedCredits = await userCredits.save();

    // Log the initial allocation
    await this.logTransaction(
      userId,
      V2CreditTransactionType.ALLOCATION,
      credits.profileScout + credits.ideaSpark + (credits.postCredits === -1 ? 0 : credits.postCredits),
      `Initial allocation for ${plan} plan`,
      undefined,
      { subscriptionId: 'initial', plan }
    );

    return savedCredits;
  }

  /**
   * Allocate monthly credits based on subscription plan
   */
  async allocateMonthlyCredits(userId: string, plan: V2SubscriptionPlan, subscriptionId?: string): Promise<void> {
    const credits = V2_PLAN_CREDITS[plan];

    const updateData = {
      profileScoutCredits: credits.profileScout,
      ideaSparkCredits: credits.ideaSpark,
      postCredits: credits.postCredits === -1 ? 999999 : credits.postCredits,
      currentPlan: plan,
      platformLimits: credits.platformLimits,
      userLimit: credits.userLimit,
      features: credits.features,
      lastResetDate: new Date(),
      nextResetDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      monthlyUsage: {
        profileScout: 0,
        ideaSpark: 0,
        posts: 0
      }
    };

    await this.creditsModel.findOneAndUpdate(
      { userId },
      updateData,
      { upsert: true }
    );

    // Log the allocation
    await this.logTransaction(
      userId,
      V2CreditTransactionType.ALLOCATION,
      credits.profileScout + credits.ideaSpark + (credits.postCredits === -1 ? 0 : credits.postCredits),
      `Monthly allocation for ${plan} plan`,
      undefined,
      { subscriptionId, plan }
    );
  }

  /**
   * Check if user has sufficient credits
   */
  async checkCredits(userId: string, creditType: V2CreditTransactionType, amount: number = 1): Promise<boolean> {
    const userCredits = await this.creditsModel.findOne({ userId, isActive: true });
    if (!userCredits) return false;

    switch (creditType) {
      case V2CreditTransactionType.PROFILE_SCOUT:
        return userCredits.profileScoutCredits >= amount;
      case V2CreditTransactionType.IDEA_SPARK:
        return userCredits.ideaSparkCredits >= amount;
      case V2CreditTransactionType.POST:
        return userCredits.postCredits >= amount || userCredits.postCredits === 999999;
      default:
        return false;
    }
  }

  /**
   * Consume credits for an operation
   */
  async consumeCredits(
    userId: string,
    creditType: V2CreditTransactionType,
    amount: number = 1,
    reason: string,
    apiEndpoint?: string,
    metadata?: any
  ): Promise<boolean> {
    const hasCredits = await this.checkCredits(userId, creditType, amount);
    if (!hasCredits) {
      throw new ForbiddenException(`Insufficient ${creditType} credits. Please upgrade your plan.`);
    }

    const updateField = `${creditType}Credits`;
    const usageField = `monthlyUsage.${creditType === V2CreditTransactionType.POST ? 'posts' : creditType}`;

    const result = await this.creditsModel.findOneAndUpdate(
      { userId, isActive: true },
      {
        $inc: {
          [updateField]: -amount,
          totalCreditsUsed: amount,
          [usageField]: amount
        }
      },
      { new: true }
    );

    if (!result) {
      throw new NotFoundException('User credits not found');
    }

    // Log the consumption
    await this.logTransaction(
      userId,
      creditType,
      -amount,
      reason,
      apiEndpoint,
      metadata,
      result[updateField]
    );

    return true;
  }

  /**
   * Get user's credit status
   */
  async getUserCredits(userId: string): Promise<V2UserCreditsDocument | null> {
    return this.creditsModel.findOne({ userId, isActive: true });
  }

  /**
   * Get user's credit status with defaults
   */
  async getUserCreditsWithDefaults(userId: string): Promise<any> {
    const credits = await this.getUserCredits(userId);

    if (!credits) {
      // Initialize credits for new user
      return await this.initializeUserCredits(userId);
    }

    return credits;
  }

  /**
   * Check platform connection limit
   */
  async checkPlatformLimit(userId: string, platform: string, currentConnections: number): Promise<boolean> {
    const userCredits = await this.getUserCredits(userId);
    if (!userCredits) return false;

    const limit = userCredits.platformLimits[platform] || 0;
    return currentConnections < limit;
  }

  /**
   * Check user limit for team plans
   */
  async checkUserLimit(userId: string, currentUsers: number): Promise<boolean> {
    const userCredits = await this.getUserCredits(userId);
    if (!userCredits) return false;

    return currentUsers < userCredits.userLimit;
  }

  /**
   * Check if user has access to a feature
   */
  async checkFeatureAccess(userId: string, feature: string): Promise<boolean> {
    const userCredits = await this.getUserCredits(userId);
    if (!userCredits) return false;

    return userCredits.features[feature] === true;
  }

  /**
   * Check plan access level
   */
  async checkPlanAccess(userId: string, requiredPlan: V2SubscriptionPlan): Promise<boolean> {
    const userCredits = await this.getUserCredits(userId);
    if (!userCredits) return false;

    const planHierarchy = {
      [V2SubscriptionPlan.FREE]: 0,
      [V2SubscriptionPlan.CREATOR]: 1,
      [V2SubscriptionPlan.PRO]: 2
    };

    const userPlanLevel = planHierarchy[userCredits.currentPlan];
    const requiredPlanLevel = planHierarchy[requiredPlan];

    return userPlanLevel >= requiredPlanLevel;
  }

  /**
   * Log a credit transaction
   */
  async logTransaction(
    userId: string,
    creditType: V2CreditTransactionType,
    amount: number,
    reason: string,
    apiEndpoint?: string,
    metadata?: any,
    balanceAfter?: number
  ): Promise<V2CreditTransactionDocument> {
    const transaction = new this.transactionModel({
      userId,
      creditType,
      amount,
      reason,
      apiEndpoint,
      metadata,
      balanceAfter,
      status: V2CreditTransactionStatus.COMPLETED,
      processedAt: new Date()
    });

    return transaction.save();
  }

  /**
   * Get user's transaction history
   */
  async getUserTransactions(userId: string, limit: number = 50, creditType?: V2CreditTransactionType): Promise<V2CreditTransactionDocument[]> {
    const query: any = { userId };
    if (creditType) {
      query.creditType = creditType;
    }

    return this.transactionModel
      .find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();
  }

  /**
   * Reset monthly credits for all users (cron job)
   */
  async resetMonthlyCredits(): Promise<void> {
    const now = new Date();
    const usersToReset = await this.creditsModel.find({
      nextResetDate: { $lte: now },
      isActive: true
    });

    for (const userCredits of usersToReset) {
      await this.allocateMonthlyCredits(userCredits.userId, userCredits.currentPlan);
    }
  }

  /**
   * Purchase additional credits
   */
  async purchaseCredits(
    userId: string,
    creditType: V2CreditTransactionType,
    amount: number,
    paymentReference: string
  ): Promise<void> {
    const updateField = `${creditType}Credits`;

    await this.creditsModel.findOneAndUpdate(
      { userId, isActive: true },
      { $inc: { [updateField]: amount } }
    );

    await this.logTransaction(
      userId,
      creditType,
      amount,
      `Credit purchase via Paystack`,
      undefined,
      { paymentReference, purchaseType: 'additional' }
    );
  }

  /**
   * Admin credit adjustment
   */
  async adminAdjustCredits(
    userId: string,
    creditType: V2CreditTransactionType,
    amount: number,
    reason: string,
    adminUserId: string,
    adminNotes?: string
  ): Promise<void> {
    const updateField = `${creditType}Credits`;

    const result = await this.creditsModel.findOneAndUpdate(
      { userId, isActive: true },
      { $inc: { [updateField]: amount } },
      { new: true }
    );

    if (!result) {
      throw new NotFoundException('User credits not found');
    }

    await this.logTransaction(
      userId,
      V2CreditTransactionType.ADMIN_ADJUSTMENT,
      amount,
      reason,
      undefined,
      { adminUserId, adminNotes },
      result[updateField]
    );
  }
}

