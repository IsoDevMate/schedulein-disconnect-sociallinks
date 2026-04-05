import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  UseGuards,
  Req,
  HttpException,
  HttpStatus,
  Headers,
  RawBodyRequest,
} from "@nestjs/common";
import { PaymentsService } from "./payments.service";
import { CreatePaymentDto } from "./dto/create-payment.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PaystackService } from "./paystack.service";
import { SubscriptionService } from "./subscription.service";
import { Request } from "express";
import { PaymentGuard } from "./guards/payment.guard";

interface AuthenticatedRequest extends Request {
  user?: any;
}

@Controller("payments")
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly paystackService: PaystackService,
    private readonly subscriptionService: SubscriptionService,
  ) {}

  @Post("initialize")
  @UseGuards(JwtAuthGuard)
  async initializePayment(
    @Body() createPaymentDto: CreatePaymentDto,
    @Req() req: Request,
  ) {
    try {
      const userId = (req.user as any)?.id;
      const payment = await this.paystackService.initializePayment(
        createPaymentDto,
        userId,
      );

      await this.paymentsService.create({
        reference: payment.data.reference,
        amount: createPaymentDto.amount * 100,
        user: userId,
        paystackTransactionId: payment.data.id,
        paymentUrl: payment.data.authorization_url,
      });

      return payment;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        "Failed to initialize payment",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get("verify/:reference")
  async verifyPayment(@Param("reference") reference: string) {
    try {
      const verification = await this.paystackService.verifyPayment(reference);
      const payment = await this.paymentsService.findByReference(reference);

      if (!payment) {
        throw new HttpException("Payment not found", HttpStatus.NOT_FOUND);
      }

      // Map Paystack status to our PaymentStatus enum
      let mappedStatus: string;
      switch (verification.data.status) {
        case "success":
          mappedStatus = "paid";
          break;
        case "failed":
          mappedStatus = "failed";
          break;
        case "pending":
          mappedStatus = "pending";
          break;
        default:
          mappedStatus = "not_paid";
      }

      // Update payment status
      await this.paymentsService.updatePaymentStatus(
        payment.id,
        mappedStatus,
        verification.data,
      );

      // If payment is successful, create subscription and allocate credits
      if (verification.data.status === "success") {
        const userId = payment.user.toString();
        const amount = verification.data.amount / 100; // Convert from kobo to naira

        // Determine plan based on amount
        let plan: string;
        if (amount >= 99) {
          plan = "PRO";
        } else if (amount >= 29) {
          plan = "CREATOR";
        } else {
          plan = "FREE";
        }

        // Create subscription record
        await this.subscriptionService.createSubscriptionRecord(
          userId,
          plan as any,
          verification.data.customer.email,
          reference
        );

        // Allocate credits
        await this.subscriptionService.allocateCreditsForPayment(
          userId,
          plan as any,
          reference
        );
      }

      return {
        status: "success",
        message: "Payment verified successfully",
        data: verification.data,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        "Failed to verify payment",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post("webhook")
  async handleWebhook(
    @Headers("x-paystack-signature") signature: string,
    @Req() req: RawBodyRequest<Request>,
  ) {
    try {
      if (!signature) {
        throw new HttpException(
          "No signature provided",
          HttpStatus.BAD_REQUEST,
        );
      }

      const isValid = await this.paystackService.handleWebhook(
        (req as any).rawBody ?? JSON.stringify(req.body),
        signature,
      );

      if (!isValid) {
        throw new HttpException(
          "Invalid webhook signature",
          HttpStatus.BAD_REQUEST,
        );
      }

      const webhookData = req.body as any;
      const payment = await this.paymentsService.findByReference(
        webhookData?.data?.reference,
      );

      if (!payment) {
        throw new HttpException("Payment not found", HttpStatus.NOT_FOUND);
      }

      if (payment.amount !== webhookData?.data?.amount) {
        throw new HttpException("Amount mismatch", HttpStatus.BAD_REQUEST);
      }

      await this.paymentsService.updatePaymentStatus(
        payment.id,
        webhookData.data.status,
        webhookData.data,
      );

      return { status: "success" };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        "Failed to process webhook",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get("callback")
  async handleCallback(@Req() req: Request) {
    try {
      const { reference } = req.query;

      if (!reference) {
        throw new HttpException(
          "No reference provided",
          HttpStatus.BAD_REQUEST,
        );
      }

      const verification = await this.paystackService.verifyPayment(
        reference as string,
      );
      const payment = await this.paymentsService.findByReference(
        reference as string,
      );

      if (!payment) {
        throw new HttpException("Payment not found", HttpStatus.NOT_FOUND);
      }

      if (payment.amount !== verification.data.amount) {
        throw new HttpException("Amount mismatch", HttpStatus.BAD_REQUEST);
      }

      await this.paymentsService.updatePaymentStatus(
        payment.id,
        verification.data.status,
        verification.data,
      );

      const redirectUrl =
        verification.data.status === "success"
          ? `${process.env.FRONTEND_URL}/payment/success?reference=${reference}`
          : `${process.env.FRONTEND_URL}/payment/failed?reference=${reference}`;

      return { redirectUrl };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        "Failed to process callback",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get("user")
  @UseGuards(JwtAuthGuard)
  async getUserPayments(@Req() req: AuthenticatedRequest) {
    try {
      const userId = req.user["id"];
      return await this.paymentsService.findByUserId(userId);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        "Failed to fetch user payments",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get("check")
  @UseGuards(JwtAuthGuard, PaymentGuard)
  async checkPaymentStatus() {
    return { status: "success", message: "Payment verified" };
  }
}
