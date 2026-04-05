import { IsString, IsOptional, IsBoolean, IsDateString } from "class-validator";
import { TikTokPostType } from "../tiktok.model";
import { Transform } from "class-transformer";
import { ApiProperty } from '@nestjs/swagger';

export class ScheduleTikTokDto {
  @ApiProperty({ description: 'Content of the TikTok post', example: 'This is my scheduled TikTok!' })
  @IsString()
  content: string;

  @ApiProperty({ description: 'Scheduled time for the post', example: '2024-06-01T12:00:00Z' })
  @IsDateString()
  scheduledTime: string;

  @ApiProperty({ description: 'URL of the media to post', example: 'https://example.com/media.mp4', required: false })
  @IsString()
  @IsOptional()
  mediaUrl?: string;

  @ApiProperty({ description: 'Title of the post', example: 'My TikTok Title', required: false })
  @IsString()
  @IsOptional()
  title?: string;

  @ApiProperty({ description: 'Description of the post', example: 'This is a description.', required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ description: 'Privacy level for the post', example: 'PUBLIC_TO_EVERYONE', required: false })
  @IsString()
  @IsOptional()
  privacyLevel?: string;

  @ApiProperty({ description: 'Disable comments for the post', example: false, required: false })
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === "true")
  readonly disableComment?: boolean;

  @ApiProperty({ description: 'Disable duet for the post', example: false, required: false })
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === "true")
  readonly disableDuet?: boolean;

  @ApiProperty({ description: 'Disable stitch for the post', example: false, required: false })
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === "true")
  readonly disableStitch?: boolean;

  @ApiProperty({ description: 'Type of the TikTok post', example: 'PERSONAL', required: false })
  @IsString()
  @IsOptional()
  postType?: TikTokPostType;
}
