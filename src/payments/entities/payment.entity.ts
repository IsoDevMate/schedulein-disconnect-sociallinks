import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Schema as MongooseSchema } from "mongoose";
import { User } from "../../users/entities/user.entity";
import { PaymentStatus } from "../dto/paystack.dto";

@Schema({ timestamps: true })
export class Payment extends Document {
  @Prop({ required: true })
  reference: string;

  @Prop({ required: true, type: Number })
  amount: number;

  @Prop({
    type: String,
    enum: PaymentStatus,
    default: PaymentStatus.PENDING,
  })
  status: PaymentStatus;

  @Prop()
  paystackTransactionId: string;

  @Prop()
  paymentUrl: string;

  @Prop({ type: Object })
  gatewayResponse: any;

  @Prop()
  channel: string;

  @Prop()
  currency: string;

  @Prop()
  paidAt: Date;

  @Prop({ type: Object })
  metadata: any;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "User" })
  user: User;
}

export const PaymentSchema = SchemaFactory.createForClass(Payment);
