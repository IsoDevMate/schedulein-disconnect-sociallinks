// import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
// import { SubscriptionService } from '../../subscriptions/subscriptions.service';

// @Injectable()
// export class SubscriptionGuard implements CanActivate {
//   constructor(private subscriptionService: SubscriptionService) {}

//   async canActivate(context: ExecutionContext): Promise<boolean> {
//     const request = context.switchToHttp().getRequest();
//     const userId = request.user._id;
//     const subscription = await this.subscriptionService.getSubscription(userId);
//     return subscription.items.data[0].price.product === 'pro';
//   }
// }
