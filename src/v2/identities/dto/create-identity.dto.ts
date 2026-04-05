import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsEnum, IsEmail } from 'class-validator';

export enum IdentityPlatform {
  TIKTOK = 'tiktok',
  INSTAGRAM = 'instagram',
  YOUTUBE = 'youtube',
  LINKEDIN = 'linkedin',
  FACEBOOK = 'facebook',
  EMAIL = 'email'
}

// Simple DTO for email registration - what the user actually fills out
export class EmailRegistrationDto {
  @ApiProperty({
    description: 'User email address',
    example: 'user@example.com'
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({
    description: 'User display name',
    example: 'John Doe'
  })
  @IsString()
  @IsOptional()
  displayName?: string;

  @ApiProperty({
    description: 'User password',
    example: 'password123'
  })
  @IsString()
  @IsNotEmpty()
  password: string;
}

// Internal DTO for creating identities (used by service methods)
export class CreateIdentityDto {
  @ApiProperty({
    description: 'Platform for the identity (tiktok, instagram, youtube, linkedin, facebook, email)',
    enum: IdentityPlatform,
    example: IdentityPlatform.TIKTOK
  })
  @IsEnum(IdentityPlatform)
  @IsNotEmpty()
  platform: IdentityPlatform;

  @ApiProperty({
    description: 'Unique identifier from the platform (e.g., TikTok open_id, Instagram user_id)',
    example: '1234567890'
  })
  @IsString()
  @IsNotEmpty()
  subjectId: string;

  @ApiProperty({
    description: 'Username from the platform',
    example: 'johndoe123'
  })
  @IsString()
  @IsOptional()
  username?: string;

  @ApiProperty({
    description: 'Display name from the platform',
    example: 'John Doe'
  })
  @IsString()
  @IsOptional()
  displayName?: string;

  @ApiProperty({
    description: 'Email from the platform (if available)',
    example: 'john@example.com'
  })
  @IsString()
  @IsOptional()
  email?: string;

  @ApiProperty({
    description: 'Profile picture URL from the platform',
    example: 'https://example.com/avatar.jpg'
  })
  @IsString()
  @IsOptional()
  profilePicture?: string;

  @ApiProperty({
    description: 'YouTube access token (for YouTube platform only)',
    example: 'ya29.a0AfB_byC...'
  })
  @IsString()
  @IsOptional()
  youtubeAccessToken?: string;

  @ApiProperty({
    description: 'YouTube refresh token (for YouTube platform only)',
    example: '1//04dX...'
  })
  @IsString()
  @IsOptional()
  youtubeRefreshToken?: string;

  @ApiProperty({
    description: 'TikTok access token (for TikTok platform only)',
    example: 'tiktok_access_token...'
  })
  @IsString()
  @IsOptional()
  tiktokAccessToken?: string;

  @ApiProperty({
    description: 'TikTok refresh token (for TikTok platform only)',
    example: 'tiktok_refresh_token...'
  })
  @IsString()
  @IsOptional()
  tiktokRefreshToken?: string;

  @ApiProperty({
    description: 'Additional platform-specific data',
    example: { followersCount: 1000, verified: true }
  })
  @IsOptional()
  platformData?: Record<string, any>;
}

// DTO for email login
export class EmailLoginDto {
  @ApiProperty({
    description: 'User email address',
    example: 'user@example.com'
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({
    description: 'User password',
    example: 'password123'
  })
  @IsString()
  @IsNotEmpty()
  password: string;
}
