import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsUrl,
  ValidateIf,
} from 'class-validator';
import { PostType, PostMediaType } from '../entities/post.entity';

export class CreatePostDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsEnum(PostType, { message: 'Invalid post type selected' })
  postType: PostType;

  @IsEnum(PostMediaType, { message: 'Invalid media type selected' })
  @IsOptional()
  postMedia?: PostMediaType;

  @IsString()
  @IsOptional()
  role?: string;

  @IsBoolean()
  isEmailVerified: boolean;

  @IsString()
  @IsOptional()
  linkedInId?: string;

  @IsString()
  @IsOptional()
  linkedInAccessToken?: string;

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
  @IsOptional()
  pictureUrl?: string;

  @IsString()
  @IsOptional()
  confirmationToken?: string;

  @IsString()
  @IsOptional()
  content: string;

  @IsOptional()
  @IsString()
  pageId?: string;

  @IsOptional()
  @IsDateString()
  scheduledTime?: string;

  @IsOptional()
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description: string;

  @IsOptional()
  @IsString()
  personUrn?: string;

  @IsOptional()
  @IsString()
  organizationUrn?: string;

  @ValidateIf((o) => o.postMedia !== PostMediaType.NONE)
  @IsUrl({}, { each: true })
  @IsOptional()
  mediaUrls?: string[];

  @ValidateIf((o) => o.postMedia !== PostMediaType.NONE)
  @IsUrl()
  @IsOptional()
  mediaUrl?: string;

  @ValidateIf((o) => o.postMedia === PostMediaType.CAROUSEL)
  @IsUrl({}, { each: true })
  @IsOptional()
  carouselUrls?: string[];
}
