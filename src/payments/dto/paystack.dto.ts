export interface PaystackCreateTransactionDto {
  amount: number;
  email: string;
  callback_url?: string;
  metadata: PaystackMetadata;
}

export interface PaystackMetadata {
  user_id: string;
  custom_fields: PaystackMetadataCustomField[];
}

export interface PaystackMetadataCustomField {
  display_name: string;
  variable_name: string;
  value: string | number;
}

export interface PaystackCreateTransactionResponseDto {
  status: boolean;
  message: string;
  data: {
    authorization_url: string;
    access_code: string;
    reference: string;
    id: string;
  };
}

export interface PaystackVerifyTransactionResponseDto {
  status: boolean;
  message: string;
  data: {
    status: string;
    reference: string;
    amount: number;
    gateway_response: string;
    paid_at: string;
    created_at: string;
    channel: string;
    currency: string;
    ip_address: string;
    metadata: any;
    customer: any;
    authorization: any;
  };
}

export interface PaystackWebhookDto {
  event: string;
  data: PaystackWebhookData;
}

export interface PaystackWebhookData {
  id?: number;
  domain?: string;
  status?: string;
  reference?: string;
  amount?: number;
  gateway_response?: string;
  paid_at?: string;
  created_at?: string;
  channel?: string;
  currency?: string;
  ip_address?: string;
  metadata?: any;
  customer: any;
  authorization: any;
}

export class PaystackCallbackDto {
  reference: string;
}

export enum PaymentStatus {
  PAID = "paid",
  NOT_PAID = "not_paid",
  PENDING = "pending",
  FAILED = "failed",
}
