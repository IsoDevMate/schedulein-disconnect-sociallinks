import { Controller, Get, Post, Body, Request, Query, UseGuards, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { V2JwtAuthGuard } from '../account-connect/guards/v2-jwt-auth.guard';
import { V2CreditsService } from './services/v2-credits.service';
import { V2CreditTransactionType } from './schemas/v2-credit-transaction.schema';
import { V2SubscriptionPlan, V2_PLAN_CREDITS } from './enums/v2-subscription-plan.enum';

@ApiTags('v2-credits')
@Controller('v2/credits')
@UseGuards(V2JwtAuthGuard)
@ApiBearerAuth()
export class V2CreditsController {
  constructor(private readonly v2CreditsService: V2CreditsService) {}

  @Get('status')
  @ApiOperation({ summary: 'Get user credit status' })
  @ApiResponse({ status: 200, description: 'Credit status retrieved successfully' })
  async getCreditStatus(@Request() req) {
    const userId = req.user.id;
    const credits = await this.v2CreditsService.getUserCreditsWithDefaults(userId);

    return {
      success: true,
      data: {
        userId: credits.userId,
        currentPlan: credits.currentPlan,
        credits: {
          profileScout: credits.profileScoutCredits,
          ideaSpark: credits.ideaSparkCredits,
          postCredits: credits.postCredits === 999999 ? 'Unlimited' : credits.postCredits
        },
        platformLimits: credits.platformLimits,
        userLimit: credits.userLimit,
        features: credits.features,
        nextResetDate: credits.nextResetDate,
        totalCreditsUsed: credits.totalCreditsUsed,
        monthlyUsage: credits.monthlyUsage
      }
    };
  }

  @Get('platform-limits')
  @ApiOperation({ summary: 'Get platform connection limits' })
  @ApiResponse({ status: 200, description: 'Platform limits retrieved successfully' })
  async getPlatformLimits(@Request() req) {
    const userId = req.user.id;
    const credits = await this.v2CreditsService.getUserCreditsWithDefaults(userId);

    return {
      success: true,
      data: {
        currentPlan: credits.currentPlan,
        platformLimits: credits.platformLimits,
        userLimit: credits.userLimit,
        nextResetDate: credits.nextResetDate
      }
    };
  }

  @Get('transactions')
  @ApiOperation({ summary: 'Get credit transaction history' })
  @ApiQuery({ name: 'limit', required: false, description: 'Number of transactions to return' })
  @ApiQuery({ name: 'creditType', required: false, description: 'Filter by credit type' })
  @ApiResponse({ status: 200, description: 'Transaction history retrieved successfully' })
  async getCreditTransactions(
    @Request() req,
    @Query('limit') limit: number = 50,
    @Query('creditType') creditType?: V2CreditTransactionType
  ) {
    const userId = req.user.id;
    const transactions = await this.v2CreditsService.getUserTransactions(userId, limit, creditType);

    return {
      success: true,
      data: {
        transactions: transactions.map(t => ({
          id: t._id,
          creditType: t.creditType,
          amount: t.amount,
          reason: t.reason,
          apiEndpoint: t.apiEndpoint,
          status: t.status,
          balanceAfter: t.balanceAfter,
          metadata: t.metadata,
          createdAt: t.createdAt,
          processedAt: t.processedAt
        })),
        total: transactions.length
      }
    };
  }

  @Get('plans')
  @ApiOperation({ summary: 'Get available subscription plans' })
  @ApiResponse({ status: 200, description: 'Subscription plans retrieved successfully' })
  async getSubscriptionPlans() {
    const plans = Object.values(V2SubscriptionPlan).map(plan => {
      const credits = V2_PLAN_CREDITS[plan];
      return {
        id: plan,
        name: plan.charAt(0).toUpperCase() + plan.slice(1),
        credits: {
          profileScout: credits.profileScout,
          ideaSpark: credits.ideaSpark,
          postCredits: credits.postCredits === -1 ? 'Unlimited' : credits.postCredits
        },
        platformLimits: credits.platformLimits,
        userLimit: credits.userLimit,
        features: credits.features
      };
    });

    return {
      success: true,
      data: { plans }
    };
  }

  @Post('allocate')
  @ApiOperation({ summary: 'Allocate credits (Admin only)' })
  @ApiResponse({ status: 200, description: 'Credits allocated successfully' })
  async allocateCredits(
    @Body() body: { userId: string; plan: V2SubscriptionPlan; subscriptionId?: string }
  ) {
    // In a real implementation, you'd add admin authentication here
    if (!body.userId || !body.plan) {
      throw new BadRequestException('userId and plan are required');
    }

    await this.v2CreditsService.allocateMonthlyCredits(body.userId, body.plan, body.subscriptionId);

    return {
      success: true,
      message: 'Credits allocated successfully'
    };
  }

  @Post('admin-adjust')
  @ApiOperation({ summary: 'Admin credit adjustment' })
  @ApiResponse({ status: 200, description: 'Credits adjusted successfully' })
  async adminAdjustCredits(
    @Body() body: {
      userId: string;
      creditType: V2CreditTransactionType;
      amount: number;
      reason: string;
      adminNotes?: string;
    },
    @Request() req
  ) {
    // In a real implementation, you'd add admin authentication here
    if (!body.userId || !body.creditType || !body.amount || !body.reason) {
      throw new BadRequestException('userId, creditType, amount, and reason are required');
    }

    await this.v2CreditsService.adminAdjustCredits(
      body.userId,
      body.creditType,
      body.amount,
      body.reason,
      req.user.id,
      body.adminNotes
    );

    return {
      success: true,
      message: 'Credits adjusted successfully'
    };
  }
}
