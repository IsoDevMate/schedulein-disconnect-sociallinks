import { Document } from 'mongoose';

export interface SocialAccount extends Document {
  platform: string; // e.g., 'instagram', 'tiktok', 'youtube', 'linkedin'
  accountId: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  profile?: {
    username?: string;
    displayName?: string;
    email?: string;
    profilePicture?: string;
    // Platform-specific fields
    [key: string]: any;
  };
  // Platform-specific data
  data?: {
    [key: string]: any;
  };
  // Additional metadata
  isConnected: boolean;
  lastSyncedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
