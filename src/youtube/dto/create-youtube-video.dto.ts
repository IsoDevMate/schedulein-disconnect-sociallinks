import { Transform } from "class-transformer";
import {
  IsString,
  IsOptional,
  IsArray,
  IsEnum,
  IsDateString,
} from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export enum PrivacyStatusEnum {
  PRIVATE = "private",
  UNLISTED = "unlisted",
  PUBLIC = "public",
}

export class CreateYouTubeVideoDto {
  @ApiProperty({ description: "The video title", example: "My Awesome Video" })
  @IsString()
  title: string;

  @ApiProperty({
    description: "The video description",
    example: "This is a description.",
    required: false,
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    description: "The YouTube video ID",
    example: "abc123",
    required: false,
  })
  @IsString()
  @IsOptional()
  videoId?: string;

  @ApiProperty({
    description: "The thumbnail URL",
    example: "https://example.com/thumbnail.jpg",
    required: false,
  })
  @IsString()
  @IsOptional()
  thumbnailUrl?: string;

  @ApiProperty({
    description: "The privacy status",
    enum: PrivacyStatusEnum,
    default: PrivacyStatusEnum.PRIVATE,
    required: false,
  })
  @IsEnum(PrivacyStatusEnum)
  @IsOptional()
  privacyStatus?: PrivacyStatusEnum = PrivacyStatusEnum.PRIVATE;

  @ApiProperty({
    description: "The thumbnail file name",
    example: "thumb.jpg",
    required: false,
  })
  @IsString()
  @IsOptional()
  thumbnail?: string;

  @ApiProperty({
    description: "Tags for the video",
    example: ["tag1", "tag2"],
    required: false,
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => {
    // Handle the case where tags might be sent as a JSON string from form data
    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        // If it's not valid JSON, treat it as a single tag or empty array
        return value ? [value] : [];
      }
    }
    return value;
  })
  tags?: string[];

  @ApiProperty({
    description: "Scheduled time for the video",
    example: "2024-06-01T12:00:00Z",
    required: false,
  })
  @IsOptional()
  @IsDateString()
  scheduledTime?: string;
}
