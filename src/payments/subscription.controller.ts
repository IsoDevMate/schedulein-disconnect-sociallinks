import {
  Controller,
  Post,
  Body,
  UseGuards,
  Headers,
  BadRequestException,
  Get,
  Res,
  HttpStatus,
} from "@nestjs/common";
import { SubscriptionService } from "./subscription.service";
import { User } from "../users/entities/user.entity";
import { GetUser } from "../common/decorators/get-user.decorator";
import { Response } from "express";
import { ResponseUtil } from "../common/utils/response.util";
import { CreateSubscriptionDto } from "./dto/create-subscription.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";

@Controller("subscription")
@UseGuards(JwtAuthGuard)
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  @Post()
  async create(
    @Body() createSubscriptionDto: CreateSubscriptionDto,
    @GetUser() user: User,
    @Res() res: Response,
  ) {
    try {
      const subscription = await this.subscriptionService.create(
        user._id.toString(),
        createSubscriptionDto,
      );
      return ResponseUtil.success(
        res,
        HttpStatus.CREATED,
        subscription,
        "Subscription created successfully",
      );
    } catch (error) {
      return ResponseUtil.error(res, error.getStatus(), error.message);
    }
  }

  @Get()
  async findAll(@GetUser() user: User, @Res() res: Response) {
    try {
      const subscriptions = await this.subscriptionService.findAll(
        user._id.toString(),
      );
      return ResponseUtil.success(
        res,
        HttpStatus.OK,
        subscriptions,
        "Subscriptions retrieved successfully",
      );
    } catch (error) {
      return ResponseUtil.error(res, error.getStatus(), error.message);
    }
  }

  @Post("webhook")
  async handleWebhook(
    @Headers("x-paystack-signature") signature: string,
    @Body() webhookData: any,
  ) {
    if (!signature) {
      throw new BadRequestException("No signature found");
    }

    // Verify webhook signature here if needed
    // This is a simplified version - you should implement proper signature verification

    if (webhookData.event === "subscription.create") {
      await this.subscriptionService.handleSubscriptionWebhook(
        webhookData.data,
      );
    }

    return { received: true };
  }
}
