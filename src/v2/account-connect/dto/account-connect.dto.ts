import {
  IsString,
  IsEnum,
  IsOptional,
  IsArray,
  IsNumber,
  IsDateString,
  IsBoolean,
} from "class-validator";
import { ApiProperty } from "@nestjs/swagger";
import {
  PlatformType,
  ConnectionStatus,
} from "../schemas/account-connect.schema";
import { GoalType, GoalStatus } from "../schemas/user-goal.schema";
import { BookmarkType } from "../schemas/bookmark.schema";
import { AnalyticsMetric, TimeRange } from "../schemas/analytics-data.schema";

export class ConnectAccountssDto {
  @ApiProperty({ enum: PlatformType, description: 'Platform to connect' })
  @IsEnum(PlatformType)
  platform: PlatformType;

  @ApiProperty({ description: 'OAuth authorization code from provider' })
  @IsString()
  code: string;

  @ApiProperty({ description: 'Redirect URI (must match provider config)', required: false })
  @IsString()
  @IsOptional()
  redirectUri?: string;

  @ApiProperty({ description: 'Idempotency key to prevent duplicate connections', required: false })
  @IsString()
  @IsOptional()
  idempotencyKey?: string;
}

// Account Connect DTOs
export class ConnectAccountDto {
  @ApiProperty({ enum: PlatformType })
  @IsEnum(PlatformType)
  platform: PlatformType;

  @ApiProperty()
  @IsString()
  platformUserId: string;

  @ApiProperty()
  @IsString()
  platformUsername: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  platformDisplayName?: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  platformProfilePicture?: string;

  @ApiProperty()
  @IsString()
  accessToken: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  refreshToken?: string;

  @ApiProperty()
  @IsDateString()
  @IsOptional()
  tokenExpiry?: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsOptional()
  permissions?: string[];

  @ApiProperty({ description: 'Platform-specific analytics data', required: false })
  @IsOptional()
  platformData?: any;
}

export class AccountConnectResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: PlatformType })
  platform: PlatformType;

  @ApiProperty()
  platformUserId: string;

  @ApiProperty()
  platformUsername: string;

  @ApiProperty()
  platformDisplayName: string;

  @ApiProperty()
  platformProfilePicture: string;

  @ApiProperty({ enum: ConnectionStatus })
  status: ConnectionStatus;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty()
  lastSyncAt: Date;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty({ type: [String] })
  permissions: string[];

  @ApiProperty()
  tokenExpiry: Date;

  @ApiProperty({ required: false })
  platformData?: any;
}

export class UpdateAccountDto {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  platformDisplayName?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  platformProfilePicture?: string;

  @ApiProperty({ enum: ConnectionStatus, required: false })
  @IsEnum(ConnectionStatus)
  @IsOptional()
  status?: ConnectionStatus;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

// export class UpdateAccountDto {
//   @ApiProperty()
//   @IsString()
//   @IsOptional()
//   platformDisplayName?: string;

//   @ApiProperty()
//   @IsString()
//   @IsOptional()
//   platformProfilePicture?: string;

//   @ApiProperty({ enum: ConnectionStatus })
//   @IsEnum(ConnectionStatus)
//   @IsOptional()
//   status?: ConnectionStatus;

//   @ApiProperty()
//   @IsBoolean()
//   @IsOptional()
//   isActive?: boolean;
// }

// Goals DTOs
export class CreateGoalDto {
  @ApiProperty()
  @IsString()
  title: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ enum: GoalType })
  @IsEnum(GoalType)
  type: GoalType;

  @ApiProperty()
  @IsNumber()
  targetValue: number;

  @ApiProperty()
  @IsDateString()
  startDate: string;

  @ApiProperty()
  @IsDateString()
  targetDate: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsOptional()
  platforms?: string[];

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsOptional()
  tags?: string[];

  @ApiProperty()
  @IsBoolean()
  @IsOptional()
  isRecurring?: boolean;

  @ApiProperty()
  @IsString()
  @IsOptional()
  recurringInterval?: string;
}

export class UpdateGoalDto {
  @ApiProperty()
  @IsString()
  @IsOptional()
  title?: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty()
  @IsNumber()
  @IsOptional()
  targetValue?: number;

  @ApiProperty()
  @IsNumber()
  @IsOptional()
  currentValue?: number;

  @ApiProperty()
  @IsDateString()
  @IsOptional()
  targetDate?: string;

  @ApiProperty({ enum: GoalStatus })
  @IsEnum(GoalStatus)
  @IsOptional()
  status?: GoalStatus;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsOptional()
  tags?: string[];
}

// Collection DTOs
export class CreateCollectionDto {
  @ApiProperty({ description: 'Collection name' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'Collection description', required: false })
  @IsString()
  @IsOptional()
  description?: string;
}

export class UpdateCollectionDto {
  @ApiProperty({ description: 'Collection name', required: false })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ description: 'Collection description', required: false })
  @IsString()
  @IsOptional()
  description?: string;
}

export class CollectionResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  description?: string;

  @ApiProperty()
  itemCount: number;

  @ApiProperty()
  lastUpdated: Date;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

// Bookmarks DTOs
export class CreateBookmarkDto {
  @ApiProperty({ enum: BookmarkType })
  @IsEnum(BookmarkType)
  type: BookmarkType;


  @ApiProperty()
  @IsString()
  title: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty()
  @IsString()
  url: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  thumbnailUrl?: string;

  @ApiProperty()
  @IsString()
  platform: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  platformContentId?: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  creatorUsername?: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  creatorDisplayName?: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsOptional()
  tags?: string[];

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsOptional()
  notes?: string[];
}

export class UpdateBookmarkDto {
  @ApiProperty()
  @IsString()
  @IsOptional()
  title?: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  description?: string;


  @ApiProperty({ type: [String] })
  @IsArray()
  @IsOptional()
  tags?: string[];

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsOptional()
  notes?: string[];

  @ApiProperty()
  @IsBoolean()
  @IsOptional()
  isFavorite?: boolean;
}

// Analytics DTOs
export class AnalyticsQueryDto {
  @ApiProperty({ enum: AnalyticsMetric })
  @IsEnum(AnalyticsMetric)
  metric: AnalyticsMetric;

  @ApiProperty({ enum: TimeRange })
  @IsEnum(TimeRange)
  @IsOptional()
  timeRange?: TimeRange;

  @ApiProperty()
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @ApiProperty()
  @IsDateString()
  @IsOptional()
  endDate?: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  platform?: string;
}

export class GenerateIdeasFromBookmarksDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsOptional()
  bookmarkIds?: string[];

  @ApiProperty()
  @IsString()
  @IsOptional()
  category?: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  platform?: string;

  @ApiProperty()
  @IsNumber()
  @IsOptional()
  numberOfIdeas?: number;
}


export class GoalResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  description: string;

  @ApiProperty({ enum: GoalType })
  type: GoalType;

  @ApiProperty()
  targetValue: number;

  @ApiProperty()
  currentValue: number;

  @ApiProperty()
  completionPercentage: number;

  @ApiProperty({ enum: GoalStatus })
  status: GoalStatus;

  @ApiProperty()
  targetDate: Date;

  @ApiProperty()
  daysLeft: number;

  @ApiProperty()
  createdAt: Date;
}

export class BookmarkResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  collectionId: string;

  @ApiProperty({ enum: BookmarkType })
  type: BookmarkType;


  @ApiProperty()
  title: string;

  @ApiProperty()
  description: string;

  @ApiProperty()
  url: string;

  @ApiProperty()
  thumbnailUrl: string;

  @ApiProperty()
  platform: string;

  @ApiProperty()
  platformContentId: string;

  @ApiProperty()
  creatorUsername: string;

  @ApiProperty()
  creatorDisplayName: string;

  @ApiProperty({ type: [String] })
  tags: string[];

  @ApiProperty({ type: [String] })
  notes: string[];

  @ApiProperty()
  isFavorite: boolean;

  @ApiProperty()
  metadata: any;

  @ApiProperty()
  aiAnalysis: any;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class AnalyticsResponseDto {
  @ApiProperty()
  metric: AnalyticsMetric;

  @ApiProperty()
  value: number;

  @ApiProperty()
  date: Date;

  @ApiProperty()
  percentageChange: number;

  @ApiProperty()
  trend: string;

  @ApiProperty({ type: [Object] })
  topContent: any[];

  @ApiProperty({ type: [Object] })
  topHashtags: any[];

  @ApiProperty({ type: [Object] })
  postingTimes: any[];

  @ApiProperty()
  performanceMetrics: any;
}

export class IdeaGenerationResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  description: string;

  @ApiProperty({ type: [String] })
  keyElements: string[];

  @ApiProperty({ type: [String] })
  hashtags: string[];

  @ApiProperty()
  estimatedEngagement: number;

  @ApiProperty()
  targetAudience: string;

  @ApiProperty()
  platform: string;

  @ApiProperty()
  createdAt: Date;
}
