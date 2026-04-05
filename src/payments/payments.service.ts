import { Injectable, HttpException, HttpStatus } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { Payment } from "./entities/payment.entity";
import { PaymentStatus } from "./dto/paystack.dto";

@Injectable()
export class PaymentsService {
  constructor(
    @InjectModel(Payment.name)
    private paymentModel: Model<Payment>,
  ) {}

  async create(createPaymentDto: Partial<Payment>): Promise<Payment> {
    try {
      const payment = new this.paymentModel({
        ...createPaymentDto,
        status: PaymentStatus.PENDING,
      });
      return await payment.save();
    } catch (error) {
      throw new HttpException(
        "Failed to create payment record",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async findByReference(reference: string): Promise<Payment> {
    try {
      return await this.paymentModel.findOne({ reference }).exec();
    } catch (error) {
      throw new HttpException(
        "Failed to find payment",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async findByUserId(userId: string): Promise<Payment[]> {
    try {
      return await this.paymentModel
        .find({ user: userId })
        .sort({ createdAt: -1 })
        .exec();
    } catch (error) {
      throw new HttpException(
        "Failed to find user payments",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async updatePaymentStatus(
    id: string,
    status: string,
    gatewayResponse: any,
  ): Promise<Payment> {
    console.log("arguements", id, status, gatewayResponse);
    try {
      const payment = await this.paymentModel.findById(id).exec();

      if (!payment) {
        throw new HttpException("Payment not found", HttpStatus.NOT_FOUND);
      }
      console.log("found payment", payment);

      payment.status = status as PaymentStatus;
      payment.gatewayResponse = gatewayResponse;
      payment.paidAt = status === PaymentStatus.PAID ? new Date() : null;

      return await payment.save();
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        "Failed to update payment status",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async hasSuccessfulPayment(userId: string): Promise<boolean> {
    try {
      const payment = await this.paymentModel
        .findOne({
          user: userId,
          status: PaymentStatus.PAID,
        })
        .exec();
      return !!payment;
    } catch (error) {
      throw new HttpException(
        "Failed to check payment status",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getUserPayments(
    userId: string,
    options?: {
      status?: PaymentStatus;
      startDate?: Date;
      endDate?: Date;
      page?: number;
      limit?: number;
    },
  ): Promise<{ payments: Payment[]; total: number }> {
    try {
      const query: any = { user: userId };

      if (options?.status) {
        query.status = options.status;
      }

      if (options?.startDate || options?.endDate) {
        query.createdAt = {};
        if (options.startDate) {
          query.createdAt.$gte = options.startDate;
        }
        if (options.endDate) {
          query.createdAt.$lte = options.endDate;
        }
      }

      const page = options?.page || 1;
      const limit = options?.limit || 10;
      const skip = (page - 1) * limit;

      // Execute query with pagination
      const [payments, total] = await Promise.all([
        this.paymentModel
          .find(query)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .exec(),
        this.paymentModel.countDocuments(query).exec(),
      ]);

      return { payments, total };
    } catch (error) {
      throw new HttpException(
        "Failed to fetch user payments",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
