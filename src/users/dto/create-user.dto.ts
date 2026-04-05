import {
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsObject,
  IsDateString,
  IsNumber,
} from "class-validator";
import { UserRole } from "../enum/user-role.enum";
import { TikTokData } from "../../common/interfaces/tiktokprofile";
export class CreateUserDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsNotEmpty()
  password: string;

  @IsString()
  @IsOptional()
  avatarUrl?: string;

  @IsString()
  @IsOptional()
  TiktokAccessToken?: string;

  @IsDateString()
  @IsOptional()
  TiktokAccessTokenExpiry?: string;

  @IsDateString()
  @IsOptional()
  TiktokRefreshTokenExpiry?: string;

  @IsObject()
  @IsOptional()
  tiktokData?: TikTokData;

  @IsString()
  @IsOptional()
  role?: UserRole = UserRole.AGENCY_ADMIN;

  @IsBoolean()
  isEmailVerified: boolean;

  @IsString()
  @IsOptional()
  avatar?: string;

  @IsString()
  @IsOptional()
  linkedInId?: string;

  @IsString()
  @IsOptional()
  linkedInAccessToken?: string;

  @IsString()
  @IsOptional()
  TiktokId?: string;

  @IsString()
  @IsOptional()
  authMethod?: string;

  @IsString()
  @IsOptional()
  firstName?: string;

  @IsString()
  organizationUrn?: string;

  @IsString()
  @IsOptional()
  lastName?: string;

  @IsString()
  @IsOptional()
  pictureUrl?: string;

  @IsString()
  @IsOptional()
  confirmationToken?: string;

  @IsString()
  @IsOptional()
  agencyAdminId?: string;

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

  @IsOptional()
  @IsString()
  instagramId?: string;

  @IsOptional()
  @IsString()
  instagramAccessToken?: string;

  @IsOptional()
  @IsNumber()
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

  @IsOptional()
  socialAccounts?: any[]; // Allow v2 users to set this to undefined

  @IsOptional()
  identities?: any[]; // Allow v2 users to initialize identities array
}
