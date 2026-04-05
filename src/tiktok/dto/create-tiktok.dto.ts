import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsBoolean,
  IsNumber,
  IsIn,
} from "class-validator";
import { Transform } from "class-transformer";
import { ApiProperty } from '@nestjs/swagger';
import { Logger } from '@nestjs/common';

export class CreatePostDto {
  @ApiProperty({ description: 'Caption for the TikTok post', example: 'Check out my new video!', required: false })
  @IsOptional()
  @IsString()
  readonly caption?: string;

  @ApiProperty({ description: 'Privacy level for the post', example: 'PUBLIC_TO_EVERYONE', enum: [
    'PUBLIC_TO_EVERYONE',
    'MUTUAL_FOLLOW_FRIENDS',
    'FOLLOWER_OF_CREATOR',
    'SELF_ONLY',
  ] })
  @IsNotEmpty()
  @IsString()
  @IsIn([
    "PUBLIC_TO_EVERYONE",
    "MUTUAL_FOLLOW_FRIENDS",
    "FOLLOWER_OF_CREATOR",
    "SELF_ONLY",
  ])
  readonly privacyLevel: string;

  @ApiProperty({ description: 'Disable duet for the post', example: false, required: false })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === "true")
  readonly disableDuet?: boolean;

  @ApiProperty({ description: 'Disable comments for the post', example: false, required: false })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === "true")
  readonly disableComment?: boolean;


  @ApiProperty({ description: 'Disable stitch for the post', example: false, required: false })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === "true")
  readonly disableStitch?: boolean;

  @ApiProperty({ description: 'Timestamp for the video cover', example: 10, required: false })
  @IsOptional()
  @IsNumber()
  readonly videoCoverTimestamp?: number;

  @ApiProperty({ description: 'Source of the video', example: 'FILE_UPLOAD', enum: ['FILE_UPLOAD', 'PULL_FROM_URL'] })
  @IsNotEmpty()
  @IsString()
  @IsIn(["FILE_UPLOAD", "PULL_FROM_URL"])
  readonly source: string;

  @ApiProperty({ description: 'Size of the video in bytes', example: 10485760, required: false })
  @IsOptional()
  @IsNumber()
  readonly videoSize?: number;

  @ApiProperty({ description: 'Chunk size for upload in bytes', example: 5242880, required: false })
  @IsOptional()
  @IsNumber()
  readonly chunkSize?: number;

  @ApiProperty({ description: 'Total number of chunks for upload', example: 2, required: false })
  @IsOptional()
  @IsNumber()
  readonly totalChunkCount?: number;

  @ApiProperty({ description: 'URL to pull the video from', example: 'https://example.com/video.mp4', required: false })
  @IsOptional()
  @IsString()
  readonly videoUrl?: string;
}
