import { IsEnum, IsOptional } from "class-validator";
import { SubscriptionPlan } from "../entities/subscription.entity";

export class CreateSubscriptionDto {
  @IsEnum(SubscriptionPlan)
  plan: SubscriptionPlan;

  @IsOptional()
  paymentMethod?: string;
}
