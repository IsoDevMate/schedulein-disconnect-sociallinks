import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { V2CreditsService } from '../services/v2-credits.service';
import { V2CreditTransactionType } from '../schemas/v2-credit-transaction.schema';

@Injectable()
export class V2CreditGuard implements CanActivate {
  constructor(
    private readonly v2CreditsService: V2CreditsService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user; // V2JwtAuthGuard provides enhanced user object

    if (!user || !user.id) {
      throw new ForbiddenException('User not authenticated');
    }

    // Get metadata from route
    const creditType = this.reflector.get<V2CreditTransactionType>('creditType', context.getHandler()) || V2CreditTransactionType.PROFILE_SCOUT;
    const creditAmount = this.reflector.get<number>('creditAmount', context.getHandler()) || 1;

    // Check if user has sufficient credits
    const hasCredits = await this.v2CreditsService.checkCredits(user.id, creditType, creditAmount);

    if (!hasCredits) {
      throw new ForbiddenException(`Insufficient ${creditType} credits. Please upgrade your plan.`);
    }

    return true;
  }
}

