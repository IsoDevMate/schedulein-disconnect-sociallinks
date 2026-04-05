// import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
// import { Document, Types } from "mongoose";

// export enum PlatformType {
//   YOUTUBE = "youtube",
//   TIKTOK = "tiktok",
//   INSTAGRAM = "instagram",
// }

// export enum ConnectionStatus {
//   CONNECTED = "connected",
//   DISCONNECTED = "disconnected",
//   EXPIRED = "expired",
//   ERROR = "error",
// }

// export enum AccountType {
//   PERSONAL = "personal",
//   BUSINESS = "business",
//   CREATOR = "creator",
//   BRAND = "brand",
// }

// @Schema({ timestamps: true })
// export class AccountConnect extends Document {
//   @Prop({ type: Types.ObjectId, ref: "User", required: true })
//   userId: Types.ObjectId;

//   @Prop({ type: String, enum: PlatformType, required: true })
//   platform: PlatformType;

//   @Prop({ required: true })
//   platformUserId: string;

//   @Prop({ required: true })
//   platformUsername: string;

//   @Prop()
//   platformDisplayName: string;

//   @Prop()
//   platformProfilePicture: string;

//   @Prop({ type: String, enum: AccountType, default: AccountType.PERSONAL })
//   accountType: AccountType;

//   @Prop()
//   accountName: string; // User-defined name for the account (e.g., "My Gaming Channel", "Business Account")

//   @Prop()
//   accountDescription: string; // Optional description

//   @Prop({
//     type: String,
//     enum: ConnectionStatus,
//     default: ConnectionStatus.CONNECTED,
//   })
//   status: ConnectionStatus;

//   @Prop()
//   accessToken: string;

//   @Prop()
//   refreshToken: string;

//   @Prop()
//   tokenExpiry: Date;

//   @Prop({ type: Object })
//   platformData: {
//     followersCount?: number;
//     followingCount?: number;
//     mediaCount?: number;
//     totalViews?: number;
//     totalLikes?: number;
//     totalComments?: number;
//     engagementRate?: number;
//     postingFrequency?: number;
//     // Platform-specific data
//     youtube?: {
//       channelId?: string;
//       channelType?: string;
//       subscriberCount?: number;
//       videoCount?: number;
//       viewCount?: number;
//       customUrl?: string;
//     };
//     tiktok?: {
//       uniqueId?: string;
//       verified?: boolean;
//       privateAccount?: boolean;
//       videoCount?: number;
//       heartCount?: number;
//     };
//     instagram?: {
//       accountType?: string;
//       verified?: boolean;
//       privateAccount?: boolean;
//       mediaCount?: number;
//       businessCategory?: string;
//     };
//   };

//   @Prop({ type: [String] })
//   permissions: string[];

//   @Prop({ default: true })
//   isActive: boolean;

//   @Prop({ default: false })
//   isPrimary: boolean; // Mark as primary account for the platform

//   @Prop({ type: [String] })
//   tags: string[]; // User-defined tags for organization

//   @Prop()
//   lastSyncAt: Date;

//   @Prop()
//   lastAnalyticsUpdate: Date;

//   @Prop({ type: Object })
//   settings: {
//     autoSync?: boolean;
//     syncFrequency?: string; // daily, weekly, monthly
//     notifications?: boolean;
//     analyticsEnabled?: boolean;
//     goalsEnabled?: boolean;
//   };

//   @Prop({ type: [Object] })
//   connectedAccounts: {
//     platform: string;
//     accountId: string;
//     accountName: string;
//     connectedAt: Date;
//   }[]; // Track cross-platform connections
// }

// export const AccountConnectSchema = SchemaFactory.createForClass(AccountConnect);

// // Enhanced indexes for better query performance
// AccountConnectSchema.index({ userId: 1, platform: 1 });
// AccountConnectSchema.index({ userId: 1, platform: 1, isPrimary: 1 });
// AccountConnectSchema.index({ platformUserId: 1, platform: 1 });
// AccountConnectSchema.index({ status: 1 });
// AccountConnectSchema.index({ lastSyncAt: 1 });
// AccountConnectSchema.index({ userId: 1, isActive: 1 });
// AccountConnectSchema.index({ userId: 1, accountType: 1 });
// AccountConnectSchema.index({ tags: 1 });

// // Compound index for efficient account queries
// AccountConnectSchema.index({ userId: 1, platform: 1, isActive: 1, status: 1 });


import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AccountConnectDocument = AccountConnect & Document;

export enum PlatformType {
  TIKTOK = 'tiktok',
  INSTAGRAM = 'instagram',
  YOUTUBE = 'youtube',
  LINKEDIN = 'linkedin'
}

export enum ConnectionStatus {
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
  EXPIRED = 'expired',
  ERROR = 'error'
}

@Schema({ timestamps: true })
export class AccountConnect {
  @Prop({ type: Types.ObjectId, required: true, ref: 'User' })
  userId: Types.ObjectId;

  @Prop({ type: String, enum: PlatformType, required: true })
  platform: PlatformType;

  @Prop({ required: true })
  platformUserId: string;

  @Prop({ required: true })
  platformUsername: string;

  @Prop({ required: true })
  platformDisplayName: string;

  @Prop()
  platformProfilePicture: string;

  @Prop({ type: String, enum: ConnectionStatus, default: ConnectionStatus.CONNECTED })
  status: ConnectionStatus;

  @Prop({ required: true })
  accessToken: string;

  @Prop()
  refreshToken: string;

  @Prop({ required: true })
  tokenExpiry: Date;

  @Prop({ type: [String], default: ['read'] })
  permissions: string[];

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: Date.now })
  lastSyncAt: Date;

  @Prop({ type: Object })
  platformData: any;

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop({ default: false })
  isPrimary: boolean;

  @Prop({ type: Object })
  metadata: any;
}

export const AccountConnectSchema = SchemaFactory.createForClass(AccountConnect);
