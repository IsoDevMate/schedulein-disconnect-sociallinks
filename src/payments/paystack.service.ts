import { Injectable, HttpException, HttpStatus } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";
import { createHmac, timingSafeEqual } from "crypto";
import { CreatePaymentDto } from "./dto/create-payment.dto";
import {
  PaystackCreateTransactionDto,
  PaystackCreateTransactionResponseDto,
  PaystackVerifyTransactionResponseDto,
  PaystackWebhookDto,
} from "./dto/paystack.dto";
import {
  PAYSTACK_TRANSACTION_INI_URL,
  PAYSTACK_TRANSACTION_VERIFY_BASE_URL,
  PAYSTACK_WEBHOOK_CRYPTO_ALGO,
  PAYSTACK_SUCCESS_STATUS,
} from "./constants/paystack.constants";

@Injectable()
export class PaystackService {
  private readonly paystackSecretKey: string;
  private readonly paystackBaseUrl: string;

  constructor(private configService: ConfigService) {
    this.paystackSecretKey = this.configService.get<string>(
      "PAYSTACK_SECRET_KEY",
    );
    this.paystackBaseUrl = "https://api.paystack.co";
  }

  async initializePayment(createPaymentDto: CreatePaymentDto, userId: string) {
    try {
      const metadata = {
        user_id: userId,
        custom_fields: [
          {
            display_name: "Payment Type",
            variable_name: "payment_type",
            value: "service_access",
          },
        ],
      };

      const paystackCreateTransactionDto: PaystackCreateTransactionDto = {
        email: createPaymentDto.email,
        amount: createPaymentDto.amount * 100,
        metadata,
        callback_url: `${this.configService.get("FRONTEND_URL")}/payment/verify`,
      };

      const response = await axios.post<PaystackCreateTransactionResponseDto>(
        PAYSTACK_TRANSACTION_INI_URL,
        paystackCreateTransactionDto,
        {
          headers: {
            Authorization: `Bearer ${this.paystackSecretKey}`,
            "Content-Type": "application/json",
          },
        },
      );

      if (!response.data.status) {
        throw new HttpException(
          response.data.message || "Payment initialization failed",
          HttpStatus.BAD_REQUEST,
        );
      }

      return response.data;
    } catch (error) {
      console.error('Paystack initialization error:', error.response?.data || error.message);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        `Payment initialization failed: ${error.message}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  async verifyPayment(reference: string) {
    try {
      const response = await axios.get<PaystackVerifyTransactionResponseDto>(
        `${PAYSTACK_TRANSACTION_VERIFY_BASE_URL}/${reference}`,
        {
          headers: {
            Authorization: `Bearer ${this.paystackSecretKey}`,
          },
        },
      );

      if (!response.data.status) {
        throw new HttpException(
          response.data.message || "Payment verification failed",
          HttpStatus.BAD_REQUEST,
        );
      }

      return response.data;
    } catch (error) {
      console.error('Paystack verification error:', error.response?.data || error.message);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        "Payment verification failed",
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  async handleWebhook(
    rawBody: Buffer | string,
    signature: string,
  ): Promise<boolean> {
    try {
      const computed = createHmac(
        PAYSTACK_WEBHOOK_CRYPTO_ALGO,
        this.paystackSecretKey,
      )
        .update(rawBody)
        .digest("hex");

      if (!computed || !signature) {
        return false;
      }

      // Compare hex strings in constant time by comparing their buffers
      const isValidEvent = timingSafeEqual(
        Buffer.from(computed, "utf8"),
        Buffer.from(signature, "utf8"),
      );

      return isValidEvent;
    } catch {
      return false;
    }
  }

  async createSubscription(
    email: string,
    plan: string,
    amount: number,
    interval: string = "monthly",
  ): Promise<any> {
    const response = await axios.post(
      `${this.paystackBaseUrl}/subscription`,
      {
        customer: email,
        plan: plan,
        amount: amount * 100, // Convert to kobo
        interval: interval,
      },
      {
        headers: {
          Authorization: `Bearer ${this.paystackSecretKey}`,
        },
      },
    );
    return response.data;
  }

  async verifySubscription(subscriptionId: string): Promise<any> {
    const response = await axios.get(
      `${this.paystackBaseUrl}/subscription/${subscriptionId}`,
      {
        headers: {
          Authorization: `Bearer ${this.paystackSecretKey}`,
        },
      },
    );
    return response.data;
  }

  async cancelSubscription(subscriptionId: string): Promise<any> {
    const response = await axios.post(
      `${this.paystackBaseUrl}/subscription/${subscriptionId}/cancel`,
      {},
      {
        headers: {
          Authorization: `Bearer ${this.paystackSecretKey}`,
        },
      },
    );
    return response.data;
  }
}
