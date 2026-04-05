import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import {
  Subscription,
  SubscriptionStatus,
} from "../entities/subscription.entity";

@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(
    @InjectModel(Subscription.name)
    private subscriptionModel: Model<Subscription>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException("User not authenticated");
    }

    const subscription = await this.subscriptionModel.findOne({
      userId: user._id,
      status: SubscriptionStatus.ACTIVE,
    });

    if (!subscription) {
      throw new UnauthorizedException("Active subscription required");
    }

    // Check if subscription is still valid
    if (new Date() > subscription.nextPaymentDate) {
      throw new UnauthorizedException("Subscription has expired");
    }

    return true;
  }
}
