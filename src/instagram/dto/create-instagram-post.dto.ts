import { IsString, IsOptional, IsEnum } from 'class-validator';

export enum InstagramMediaType {
  IMAGE = 'IMAGE',
  VIDEO = 'VIDEO',
  REEL = 'REEL',
}

export class CreateInstagramPostDto {
  @IsString()
  mediaUrl: string;

  @IsEnum(InstagramMediaType)
  mediaType: InstagramMediaType;

  @IsString()
  @IsOptional()
  caption?: string;
}
