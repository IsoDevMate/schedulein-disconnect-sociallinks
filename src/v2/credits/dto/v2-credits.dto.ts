import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsString, IsOptional, IsObject } from 'class-validator';
import { V2CreditTransactionType } from '../schemas/v2-credit-transaction.schema';
import { V2SubscriptionPlan } from '../enums/v2-subscription-plan.enum';

export class V2CreditStatusDto {
  @ApiProperty({ description: 'User ID' })
  userId: string;

  @ApiProperty({ description: 'Current subscription plan' })
  currentPlan: V2SubscriptionPlan;

  @ApiProperty({ description: 'Credit balances' })
  credits: {
    profileScout: number;
    ideaSpark: number;
    postCredits: number | string;
  };

  @ApiProperty({ description: 'Platform connection limits' })
  platformLimits: {
    tiktok: number;
    youtube: number;
    instagram: number;
    linkedin: number;
  };

  @ApiProperty({ description: 'User limit for team plans' })
  userLimit: number;

  @ApiProperty({ description: 'Available features' })
  features: object;

  @ApiProperty({ description: 'Next credit reset date' })
  nextResetDate: Date;

  @ApiProperty({ description: 'Total credits used' })
  totalCreditsUsed: number;

  @ApiProperty({ description: 'Monthly usage statistics' })
  monthlyUsage: {
    profileScout: number;
    ideaSpark: number;
    posts: number;
  };
}

export class V2CreditTransactionDto {
  @ApiProperty({ description: 'Transaction ID' })
  id: string;

  @ApiProperty({ description: 'Credit type' })
  creditType: V2CreditTransactionType;

  @ApiProperty({ description: 'Amount (positive for allocation, negative for consumption)' })
  amount: number;

  @ApiProperty({ description: 'Transaction reason' })
  reason: string;

  @ApiProperty({ description: 'API endpoint that triggered the transaction', required: false })
  apiEndpoint?: string;

  @ApiProperty({ description: 'Transaction status' })
  status: string;

  @ApiProperty({ description: 'Credit balance after transaction', required: false })
  balanceAfter?: number;

  @ApiProperty({ description: 'Additional metadata', required: false })
  metadata?: object;

  @ApiProperty({ description: 'Transaction creation date' })
  createdAt: Date;

  @ApiProperty({ description: 'Transaction processing date' })
  processedAt: Date;
}

export class V2SubscriptionPlanDto {
  @ApiProperty({ description: 'Plan ID' })
  id: string;

  @ApiProperty({ description: 'Plan name' })
  name: string;

  @ApiProperty({ description: 'Credit allocation' })
  credits: {
    profileScout: number;
    ideaSpark: number;
    postCredits: number | string;
  };

  @ApiProperty({ description: 'Platform connection limits' })
  platformLimits: {
    tiktok: number;
    youtube: number;
    instagram: number;
    linkedin: number;
  };

  @ApiProperty({ description: 'User limit for team plans' })
  userLimit: number;

  @ApiProperty({ description: 'Available features' })
  features: object;
}

export class V2AllocateCreditsDto {
  @ApiProperty({ description: 'User ID to allocate credits to' })
  @IsString()
  userId: string;

  @ApiProperty({ description: 'Subscription plan' })
  @IsEnum(V2SubscriptionPlan)
  plan: V2SubscriptionPlan;

  @ApiProperty({ description: 'Subscription ID', required: false })
  @IsOptional()
  @IsString()
  subscriptionId?: string;
}

export class V2AdminAdjustCreditsDto {
  @ApiProperty({ description: 'User ID to adjust credits for' })
  @IsString()
  userId: string;

  @ApiProperty({ description: 'Credit type to adjust' })
  @IsEnum(V2CreditTransactionType)
  creditType: V2CreditTransactionType;

  @ApiProperty({ description: 'Amount to adjust (positive to add, negative to subtract)' })
  @IsNumber()
  amount: number;

  @ApiProperty({ description: 'Reason for adjustment' })
  @IsString()
  reason: string;

  @ApiProperty({ description: 'Admin notes', required: false })
  @IsOptional()
  @IsString()
  adminNotes?: string;
}

