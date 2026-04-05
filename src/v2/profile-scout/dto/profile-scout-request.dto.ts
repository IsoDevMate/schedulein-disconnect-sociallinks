import { IsString, IsEnum, IsOptional, IsBoolean, IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum ProfilePlatform {
  TIKTOK = 'tiktok',
  YOUTUBE = 'youtube',
}

export class ProfileScoutRequestDto {
  @ApiProperty({
    enum: ProfilePlatform,
    description: 'Platform to analyze (TikTok or YouTube)',
    example: ProfilePlatform.YOUTUBE,
  })
  platform: ProfilePlatform;

  @ApiProperty({
    description: 'Username to analyze (without @ symbol)',
    example: 'mrbeast',
  })
  username: string;

  @ApiProperty({
    description: 'Include AI-generated content ideas in the report',
    required: false,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  includeIdeaSpark?: boolean = true;

  @ApiProperty({
    description: 'Number of recent videos to analyze (max 50)',
    required: false,
    default: 50,
    minimum: 1,
    maximum: 50,
  })
  @IsOptional()
  @IsNumber()
  maxVideos?: number = 50;
}
