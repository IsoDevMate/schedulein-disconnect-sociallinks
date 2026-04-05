import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { V2CreditsService } from '../services/v2-credits.service';
import { V2SubscriptionPlan } from '../enums/v2-subscription-plan.enum';

@Injectable()
export class V2PlanFeatureGuard implements CanActivate {
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
    const requiredPlan = this.reflector.get<V2SubscriptionPlan>('requiredPlan', context.getHandler());
    const requiredFeature = this.reflector.get<string>('requiredFeature', context.getHandler());

    // Check plan access if required plan is specified
    if (requiredPlan) {
      const hasPlanAccess = await this.v2CreditsService.checkPlanAccess(user.id, requiredPlan);
      if (!hasPlanAccess) {
        throw new ForbiddenException(`This feature requires ${requiredPlan} plan or higher. Please upgrade your plan.`);
      }
    }

    // Check feature access if required feature is specified
    if (requiredFeature) {
      const hasFeatureAccess = await this.v2CreditsService.checkFeatureAccess(user.id, requiredFeature);
      if (!hasFeatureAccess) {
        throw new ForbiddenException(`This feature is not available in your current plan. Please upgrade your plan.`);
      }
    }

    return true;
  }
}

