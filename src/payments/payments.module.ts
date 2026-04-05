import { Module, forwardRef } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { PaymentsController } from "./payments.controller";
import { PaymentsService } from "./payments.service";
import { PaystackService } from "./paystack.service";
import { Payment, PaymentSchema } from "./entities/payment.entity";
import { SubscriptionService } from "./subscription.service";
import { SubscriptionController } from "./subscription.controller";
import {
  Subscription,
  SubscriptionSchema,
} from "./entities/subscription.entity";
import { ConfigModule } from "@nestjs/config";
import { V2CreditsModule } from "../v2/credits/v2-credits.module";

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Payment.name, schema: PaymentSchema }]),
    MongooseModule.forFeature([
      { name: Subscription.name, schema: SubscriptionSchema },
    ]),
    ConfigModule,
    forwardRef(() => V2CreditsModule),
  ],
  controllers: [PaymentsController, SubscriptionController],
  providers: [PaymentsService, PaystackService, SubscriptionService],
  exports: [SubscriptionService],
})
export class PaymentsModule {}
