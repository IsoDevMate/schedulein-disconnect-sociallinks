import { IdentityPlatform } from '../dto/create-identity.dto';

export interface Identity {
  platform: IdentityPlatform;
  subjectId: string;
  username?: string;
  displayName?: string;
  email?: string;
  profilePicture?: string;
  platformData?: Record<string, any>;
  // Token fields for platform-specific access
  tiktokAccessToken?: string;
  tiktokRefreshToken?: string;
  youtubeAccessToken?: string;
  youtubeRefreshToken?: string;
  isActive: boolean;
  lastUsedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  // Note: No _id or id fields - we disabled them in the schema
}

export interface CreateIdentityRequest {
  platform: IdentityPlatform;
  code: string;
  redirectUri?: string;
}

export interface IdentityValidationResult {
  isValid: boolean;
  identity?: Identity;
  error?: string;
}

export interface IdentityLinkResult {
  success: boolean;
  identity?: Identity;
  error?: string;
  isNewUser?: boolean;
}

export interface IdentityProfile {
  platform: IdentityPlatform;
  subjectId: string;
  username?: string;
  displayName?: string;
  email?: string;
  profilePicture?: string;
  platformData?: Record<string, any>;
}
