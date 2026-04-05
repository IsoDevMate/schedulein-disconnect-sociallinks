import {
  IsEmail,
  IsOptional,
  IsString,
  IsBoolean,
  IsObject,
  IsDateString,
  IsDate,
  IsNumber,
} from "class-validator";
import { UserRole } from "../enum/user-role.enum";
import { TikTokData } from "../../common/interfaces/tiktokprofile";

export class UpdateUserDto {
  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  password?: string;

  @IsString()
  @IsOptional()
  role?: UserRole;

  @IsString()
  @IsOptional()
  avatar?: string;

  @IsObject()
  @IsOptional()
  tiktokData?: TikTokData;

  @IsString()
  @IsOptional()
  linkedInAccessToken?: string;

  @IsString()
  @IsOptional()
  linkedInRefreshToken?: string;

  @IsString()
  @IsOptional()
  TiktokAccessToken?: string;

  @IsString()
  @IsOptional()
  TiktokRefreshToken?: string;

  @IsDateString()
  @IsOptional()
  TiktokAccessTokenExpiry?: string;

  @IsDateString()
  @IsOptional()
  TiktokRefreshTokenExpiry?: string;

  @IsString()
  @IsOptional()
  authMethod?: string;

  @IsString()
  @IsOptional()
  firstName?: string;

  @IsString()
  @IsOptional()
  lastName?: string;

  @IsString()
  organizationUrn?: string;

  @IsString()
  @IsOptional()
  pictureUrl?: string;

  @IsString()
  @IsOptional()
  avatarUrl?: string;

  @IsBoolean()
  @IsOptional()
  isEmailVerified?: boolean;

  @IsString()
  @IsOptional()
  agencyId?: string;

  @IsOptional()
  linkedInCompanyPages?: any[];

  @IsString()
  @IsOptional()
  subscriptionId?: string;

  @IsString()
  @IsOptional()
  StripeCustomerId?: string;

  @IsString()
  @IsOptional()
  affiliateId?: string;

  @IsString()
  @IsOptional()
  referredBy?: string;

  @IsString()
  @IsOptional()
  resetToken?: string;

  @IsString()
  @IsOptional()
  TiktokId?: string;

  @IsOptional()
  @IsString()
  youtubeAccessToken?: string;

  @IsOptional()
  @IsString()
  youtubeRefreshToken?: string;

  @IsOptional()
  @IsNumber()
  youtubeAccessTokenExpiry?: number;

  @IsOptional()
  @IsNumber()
  youtubeRefreshTokenExpiry?: number;

  @IsDate()
  @IsOptional()
  lastLoginAt?: Date;

  @IsString()
  @IsOptional()
  lastLoginIp?: string;

  @IsDate()
  @IsOptional()
  lastTokenRefreshAt?: Date;

  @IsOptional()
  @IsString()
  confirmationToken?: string;

  @IsOptional()
  resetTokenExpires?: Date;

  @IsOptional()
  @IsString()
  linkedInId?: string;

  @IsOptional()
  @IsString()
  instagramId?: string;

  @IsOptional()
  @IsString()
  instagramAccessToken?: string;

  @IsOptional()
  instagramAccessTokenExpiry?: number;

  @IsOptional()
  @IsObject()
  instagramData?: {
    username: string;
    profilePicture: string;
    mediaCount: number;
    followersCount: number;
    followingCount: number;
  };
}
