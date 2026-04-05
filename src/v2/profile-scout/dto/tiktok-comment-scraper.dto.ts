import { IsString, IsOptional, IsNumber, IsBoolean, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TikTokCommentScrapingRequestDto {
  @ApiProperty({
    description: 'TikTok video URL to scrape comments from',
    example: 'https://www.tiktok.com/@username/video/1234567890',
  })
  @IsString()
  videoUrl: string;

  @ApiPropertyOptional({
    description: 'Maximum number of comments to scrape',
    default: 500,
    minimum: 1,
    maximum: 10000,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10000)
  maxComments?: number = 500;

  @ApiPropertyOptional({
    description: 'Whether to include replies to comments',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  includeReplies?: boolean = true;

  @ApiPropertyOptional({
    description: 'Maximum number of replies per comment to scrape',
    default: 10,
    minimum: 1,
    maximum: 50,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(50)
  maxRepliesPerComment?: number = 10;

  @ApiPropertyOptional({
    description: 'Timeout for scraping operation in milliseconds',
    default: 120000,
    minimum: 30000,
    maximum: 300000,
  })
  @IsOptional()
  @IsNumber()
  @Min(30000)
  @Max(300000)
  timeout?: number = 120000;
}

export class TikTokCommentDto {
  @ApiProperty({
    description: 'Unique identifier for the comment',
  })
  id: string;

  @ApiProperty({
    description: 'Username of the commenter',
  })
  username: string;

  @ApiProperty({
    description: 'Profile URL of the commenter',
  })
  userProfileUrl: string;

  @ApiProperty({
    description: 'Text content of the comment',
  })
  commentText: string;

  @ApiProperty({
    description: 'Time when the comment was posted (relative)',
  })
  timeCommentedAgo: string;

  @ApiProperty({
    description: 'Number of likes on the comment',
  })
  likesCount: number;

  @ApiProperty({
    description: 'URL of the commenter\'s profile picture',
  })
  profilePictureUrl: string;

  @ApiProperty({
    description: 'Whether this comment is a reply to another comment',
  })
  isReply: boolean;

  @ApiPropertyOptional({
    description: 'ID of the parent comment if this is a reply',
  })
  parentCommentId?: string;

  @ApiPropertyOptional({
    description: 'Number of replies to this comment',
  })
  replyCount?: number;

  @ApiProperty({
    description: 'Comment level (1 for top-level, 2 for replies)',
  })
  level: number;
}

export class TikTokVideoMetadataDto {
  @ApiProperty({
    description: 'Unique identifier for the video',
  })
  videoId: string;

  @ApiProperty({
    description: 'Username of the video creator',
  })
  creatorUsername: string;

  @ApiProperty({
    description: 'Profile URL of the video creator',
  })
  creatorProfileUrl: string;

  @ApiProperty({
    description: 'Description/caption of the video',
  })
  videoDescription: string;

  @ApiProperty({
    description: 'Time when the video was published',
  })
  publishTime: string;

  @ApiProperty({
    description: 'Number of likes on the video',
  })
  likeCount: number;

  @ApiProperty({
    description: 'Number of shares of the video',
  })
  shareCount: number;

  @ApiProperty({
    description: 'Number of views on the video',
  })
  viewCount: number;

  @ApiProperty({
    description: 'List of hashtags used in the video',
    type: [String],
  })
  hashtags: string[];
}

export class TikTokCommentAnalysisDto {
  @ApiProperty({
    description: 'Total number of comments analyzed',
  })
  totalComments: number;

  @ApiProperty({
    description: 'Average number of likes per comment',
  })
  averageLikes: number;

  @ApiProperty({
    description: 'Top commenters by likes',
    type: [String],
  })
  topCommenters: string[];

  @ApiProperty({
    description: 'Most common words in comments',
    type: [String],
  })
  commonWords: string[];

  @ApiProperty({
    description: 'Sentiment distribution of comments',
    type: 'object',
    properties: {
      positive: { type: 'number', description: 'Percentage of positive comments' },
      negative: { type: 'number', description: 'Percentage of negative comments' },
      neutral: { type: 'number', description: 'Percentage of neutral comments' },
    },
  })
  sentimentDistribution: {
    positive: number;
    negative: number;
    neutral: number;
  };
}

export class TikTokCommentScrapingResponseDto {
  @ApiProperty({
    description: 'Original video URL that was scraped',
  })
  videoUrl: string;

  @ApiProperty({
    description: 'Total number of comments available on the video',
  })
  totalComments: number;

  @ApiProperty({
    description: 'Number of comments successfully scraped',
  })
  scrapedComments: number;

  @ApiProperty({
    description: 'Array of scraped comments',
    type: [TikTokCommentDto],
  })
  comments: TikTokCommentDto[];

  @ApiProperty({
    description: 'Time taken to scrape comments in milliseconds',
  })
  scrapingTime: number;

  @ApiProperty({
    description: 'Whether the scraping operation was successful',
  })
  success: boolean;

  @ApiPropertyOptional({
    description: 'Error message if scraping failed',
  })
  error?: string;

  @ApiPropertyOptional({
    description: 'Video metadata extracted during scraping',
    type: TikTokVideoMetadataDto,
  })
  videoMetadata?: TikTokVideoMetadataDto;

  @ApiPropertyOptional({
    description: 'Comment analysis results',
    type: TikTokCommentAnalysisDto,
  })
  analysis?: TikTokCommentAnalysisDto;
}



