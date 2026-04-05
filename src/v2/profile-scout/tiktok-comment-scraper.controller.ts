import { Controller, Post, Body, Get, Param, Query, HttpException, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { TikTokCommentScraperService } from './services/tiktok-comment-scraper.service';
import {
  TikTokCommentScrapingRequestDto,
  TikTokCommentScrapingResponseDto,
  TikTokCommentDto,
  TikTokCommentAnalysisDto,
} from './dto/tiktok-comment-scraper.dto';

@ApiTags('TikTok Comment Scraper')
@Controller('v2/profile-scout/tiktok/comments')
export class TikTokCommentScraperController {
  constructor(
    private readonly tiktokCommentScraperService: TikTokCommentScraperService,
  ) {}

  @Post('scrape')
  @ApiOperation({
    summary: 'Scrape comments from a TikTok video',
    description: 'Scrapes comments from a TikTok video URL with configurable options for maximum comments, replies, and timeout.',
  })
  @ApiResponse({
    status: 200,
    description: 'Comments successfully scraped',
    type: TikTokCommentScrapingResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request parameters',
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error during scraping',
  })
  async scrapeComments(
    @Body() request: TikTokCommentScrapingRequestDto,
  ): Promise<TikTokCommentScrapingResponseDto> {
    try {
      const result = await this.tiktokCommentScraperService.scrapeComments(
        request.videoUrl,
        {
          maxComments: request.maxComments,
          includeReplies: request.includeReplies,
          maxRepliesPerComment: request.maxRepliesPerComment,
          timeout: request.timeout,
        }
      );

      // Perform analysis on the scraped comments
      const analysis = await this.tiktokCommentScraperService.analyzeComments(result.comments);

      return {
        ...result,
        analysis,
      };
    } catch (error) {
      throw new HttpException(
        {
          message: 'Failed to scrape TikTok comments',
          error: error.message,
          videoUrl: request.videoUrl,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('analyze/:videoId')
  @ApiOperation({
    summary: 'Analyze comments from a previously scraped video',
    description: 'Performs sentiment analysis and demographic insights on comments from a TikTok video.',
  })
  @ApiParam({
    name: 'videoId',
    description: 'TikTok video ID',
    example: '1234567890',
  })
  @ApiResponse({
    status: 200,
    description: 'Comment analysis completed',
    type: TikTokCommentAnalysisDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Video not found or no comments available',
  })
  async analyzeComments(@Param('videoId') videoId: string): Promise<TikTokCommentAnalysisDto> {
    try {
      // This would typically fetch from cache or database
      // For now, we'll return a placeholder
      throw new HttpException(
        'Comment analysis requires comments to be scraped first',
        HttpStatus.NOT_FOUND,
      );
    } catch (error) {
      throw new HttpException(
        {
          message: 'Failed to analyze comments',
          error: error.message,
          videoId,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('demo/:username')
  @ApiOperation({
    summary: 'Get demo comments for a TikTok user',
    description: 'Returns sample comments for demonstration purposes without actual scraping.',
  })
  @ApiParam({
    name: 'username',
    description: 'TikTok username',
    example: 'example_user',
  })
  @ApiQuery({
    name: 'maxComments',
    description: 'Maximum number of demo comments to return',
    required: false,
    type: Number,
  })
  @ApiResponse({
    status: 200,
    description: 'Demo comments returned',
    type: [TikTokCommentDto],
  })
  async getDemoComments(
    @Param('username') username: string,
    @Query('maxComments') maxComments: number = 10,
  ): Promise<TikTokCommentDto[]> {
    // Return mock data for demonstration
    const mockComments: TikTokCommentDto[] = [
      {
        id: 'demo_1',
        username: 'user1',
        userProfileUrl: `https://www.tiktok.com/@user1`,
        commentText: 'This is amazing! 🔥',
        timeCommentedAgo: '2h ago',
        likesCount: 45,
        profilePictureUrl: 'https://example.com/avatar1.jpg',
        isReply: false,
        level: 1,
      },
      {
        id: 'demo_2',
        username: 'user2',
        userProfileUrl: `https://www.tiktok.com/@user2`,
        commentText: 'Love this content!',
        timeCommentedAgo: '1h ago',
        likesCount: 23,
        profilePictureUrl: 'https://example.com/avatar2.jpg',
        isReply: false,
        level: 1,
      },
      {
        id: 'demo_3',
        username: 'user3',
        userProfileUrl: `https://www.tiktok.com/@user3`,
        commentText: 'Totally agree!',
        timeCommentedAgo: '30m ago',
        likesCount: 12,
        profilePictureUrl: 'https://example.com/avatar3.jpg',
        isReply: true,
        parentCommentId: 'demo_1',
        level: 2,
      },
    ];

    return mockComments.slice(0, maxComments);
  }

  @Get('health')
  @ApiOperation({
    summary: 'Check TikTok comment scraper health',
    description: 'Returns the health status of the TikTok comment scraper service.',
  })
  @ApiResponse({
    status: 200,
    description: 'Service is healthy',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'healthy' },
        timestamp: { type: 'string', example: '2024-01-15T10:30:00Z' },
        version: { type: 'string', example: '1.0.0' },
      },
    },
  })
  async getHealth() {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      service: 'TikTok Comment Scraper',
    };
  }
}



