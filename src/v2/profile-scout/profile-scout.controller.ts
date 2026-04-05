import { Controller, Post, Body, Get, Param, Delete, Put, Query, UseGuards, Request, BadRequestException, InternalServerErrorException, NotFoundException, SetMetadata } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { V2JwtAuthGuard } from '../account-connect/guards/v2-jwt-auth.guard';
import { V2CreditGuard } from '../credits/guards/v2-credit.guard';
import { ProfileScoutService } from './profile-scout.service';
import { ProfileScoutMonitoringService } from './services/monitoring.service';
import { ProfileScoutRequestDto } from './dto/profile-scout-request.dto';
import { ProfileScoutResponseDto } from './dto/profile-scout-response.dto';
import { V2CreditsService } from '../credits/services/v2-credits.service';
import { V2CreditTransactionType } from '../credits/schemas/v2-credit-transaction.schema';

@ApiTags('v2-profile-scout')
@Controller('v2/profile-scout')
@UseGuards(V2JwtAuthGuard)
@ApiBearerAuth()
export class ProfileScoutController {
  constructor(
    private readonly profileScoutService: ProfileScoutService,
    private readonly monitoringService: ProfileScoutMonitoringService,
    private readonly v2CreditsService: V2CreditsService,
  ) {}

  @Post('analyze')
  @UseGuards(V2CreditGuard)
  @SetMetadata('creditType', V2CreditTransactionType.PROFILE_SCOUT)
  @SetMetadata('creditAmount', 1)
  @ApiOperation({
    summary: 'Analyze a social media profile',
    description: 'Perform comprehensive analysis of a TikTok or YouTube profile. Consumes 1 Profile Scout credit.',
  })
  @ApiResponse({
    status: 201,
    description: 'Analysis completed successfully',
    type: ProfileScoutResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid request parameters' })
  @ApiResponse({ status: 403, description: 'Insufficient Profile Scout credits' })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async analyzeProfile(
    @Body() request: ProfileScoutRequestDto,
    @Request() req,
  ): Promise<ProfileScoutResponseDto> {
    try {
      const userId = req.user.id;
      const result = await this.profileScoutService.analyzeProfile(request, userId);

      // Consume credits after successful analysis
      await this.v2CreditsService.consumeCredits(
        userId,
        V2CreditTransactionType.PROFILE_SCOUT,
        1,
        'Profile analysis completed',
        '/v2/profile-scout/analyze',
        {
          platform: request.platform,
          username: request.username,
          analysisId: result.analysisId
        }
      );

      return result;
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException('Profile analysis failed');
    }
  }

  @Get('health')
  @ApiOperation({
    summary: 'Get system health status',
    description: 'Check the health status of the Profile Scout service',
  })
  @ApiResponse({
    status: 200,
    description: 'Health status retrieved successfully',
  })
  async getHealthStatus(): Promise<any> {
    return await this.monitoringService.runHealthCheck();
  }

  @Get('metrics')
  @ApiOperation({
    summary: 'Get system metrics',
    description: 'Get detailed performance metrics for the Profile Scout service',
  })
  @ApiResponse({
    status: 200,
    description: 'Metrics retrieved successfully',
  })
  async getSystemMetrics(): Promise<any> {
    const [healthMetrics, performanceInsights] = await Promise.all([
      this.monitoringService.getHealthMetrics(),
      this.monitoringService.getPerformanceInsights(),
    ]);

    return {
      health: healthMetrics,
      insights: performanceInsights,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('errors')
  @ApiOperation({
    summary: 'Get error analysis',
    description: 'Get detailed analysis of recent errors and failure patterns',
  })
  @ApiQuery({ name: 'hours', required: false, description: 'Hours to look back (default: 24)' })
  @ApiResponse({
    status: 200,
    description: 'Error analysis retrieved successfully',
  })
  async getErrorAnalysis(@Query('hours') hours?: string): Promise<any> {
    const hoursToAnalyze = hours ? parseInt(hours) : 24;
    return await this.monitoringService.getErrorAnalysis(hoursToAnalyze);
  }

  @Get('history')
  @ApiOperation({
    summary: 'Get analysis history',
    description: 'Retrieve the history of Profile Scout analyses performed by the user.',
  })
  @ApiQuery({ name: 'limit', required: false, description: 'Number of results to return (default: 20)' })
  @ApiQuery({ name: 'offset', required: false, description: 'Number of results to skip (default: 0)' })
  @ApiQuery({ name: 'platform', required: false, description: 'Filter by platform (youtube, tiktok)' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by status (pending, completed, failed)' })
  @ApiResponse({
    status: 200,
    description: 'Analysis history retrieved successfully',
  })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async getAnalysisHistory(
    @Request() req,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('platform') platform?: string,
    @Query('status') status?: string,
  ): Promise<{ analyses: any[]; total: number }> {
    try {
      const userId = req.user.sub;
      const limitNum = limit ? parseInt(limit) : 20;
      const offsetNum = offset ? parseInt(offset) : 0;

      if (limitNum < 1 || limitNum > 100) {
        throw new BadRequestException('Limit must be between 1 and 100');
      }

      if (offsetNum < 0) {
        throw new BadRequestException('Offset must be non-negative');
      }

      return await this.profileScoutService.getAnalysisHistory(
        userId,
        limitNum,
        offsetNum,
        platform,
        status,
      );
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to fetch analysis history');
    }
  }

  @Get('history/:analysisId')
  @ApiOperation({
    summary: 'Get analysis by ID',
    description: 'Retrieve a specific analysis by its ID',
  })
  @ApiParam({ name: 'analysisId', description: 'Analysis ID' })
  @ApiResponse({
    status: 200,
    description: 'Analysis retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Analysis not found' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async getAnalysisById(
    @Param('analysisId') analysisId: string,
    @Request() req,
  ): Promise<any> {
    try {
      const userId = req.user.sub;
      return await this.profileScoutService.getAnalysisById(analysisId, userId);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to fetch analysis');
    }
  }

  @Delete('history/:analysisId')
  @ApiOperation({
    summary: 'Delete analysis',
    description: 'Delete a specific analysis by its ID',
  })
  @ApiParam({ name: 'analysisId', description: 'Analysis ID' })
  @ApiResponse({
    status: 200,
    description: 'Analysis deleted successfully',
  })
  @ApiResponse({ status: 404, description: 'Analysis not found' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async deleteAnalysis(
    @Param('analysisId') analysisId: string,
    @Request() req,
  ): Promise<{ message: string }> {
    try {
      const userId = req.user.sub;
      await this.profileScoutService.deleteAnalysis(analysisId, userId);
      return { message: 'Analysis deleted successfully' };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to delete analysis');
    }
  }

  @Put('history/:analysisId/favorite')
  @ApiOperation({
    summary: 'Toggle favorite status',
    description: 'Toggle the favorite status of an analysis',
  })
  @ApiParam({ name: 'analysisId', description: 'Analysis ID' })
  @ApiResponse({
    status: 200,
    description: 'Favorite status toggled successfully',
  })
  @ApiResponse({ status: 404, description: 'Analysis not found' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async toggleFavorite(
    @Param('analysisId') analysisId: string,
    @Request() req,
  ): Promise<{ isFavorite: boolean }> {
    try {
      const userId = req.user.sub;
      return await this.profileScoutService.toggleFavorite(analysisId, userId);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to toggle favorite status');
    }
  }

  @Put('history/:analysisId/notes')
  @ApiOperation({
    summary: 'Add notes to analysis',
    description: 'Add or update notes for an analysis',
  })
  @ApiParam({ name: 'analysisId', description: 'Analysis ID' })
  @ApiResponse({
    status: 200,
    description: 'Notes added successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid notes' })
  @ApiResponse({ status: 404, description: 'Analysis not found' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async addNotes(
    @Param('analysisId') analysisId: string,
    @Body() body: { notes: string },
    @Request() req,
  ): Promise<{ message: string }> {
    try {
      const userId = req.user.sub;

      if (!body.notes) {
        throw new BadRequestException('Notes are required');
      }

      await this.profileScoutService.addNotes(analysisId, userId, body.notes);
      return { message: 'Notes added successfully' };
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to add notes');
    }
  }

  @Post('history/:analysisId/tags')
  @ApiOperation({
    summary: 'Add tags to analysis',
    description: 'Add tags to an analysis',
  })
  @ApiParam({ name: 'analysisId', description: 'Analysis ID' })
  @ApiResponse({
    status: 200,
    description: 'Tags added successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid tags' })
  @ApiResponse({ status: 404, description: 'Analysis not found' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async addTags(
    @Param('analysisId') analysisId: string,
    @Body() body: { tags: string[] },
    @Request() req,
  ): Promise<{ message: string }> {
    try {
      const userId = req.user.sub;

      if (!body.tags || !Array.isArray(body.tags)) {
        throw new BadRequestException('Tags array is required');
      }

      await this.profileScoutService.addTags(analysisId, userId, body.tags);
      return { message: 'Tags added successfully' };
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to add tags');
    }
  }

  @Delete('history/:analysisId/tags')
  @ApiOperation({
    summary: 'Remove tags from analysis',
    description: 'Remove tags from an analysis',
  })
  @ApiParam({ name: 'analysisId', description: 'Analysis ID' })
  @ApiResponse({
    status: 200,
    description: 'Tags removed successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid tags' })
  @ApiResponse({ status: 404, description: 'Analysis not found' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async removeTags(
    @Param('analysisId') analysisId: string,
    @Body() body: { tags: string[] },
    @Request() req,
  ): Promise<{ message: string }> {
    try {
      const userId = req.user.sub;

      if (!body.tags || !Array.isArray(body.tags)) {
        throw new BadRequestException('Tags array is required');
      }

      await this.profileScoutService.removeTags(analysisId, userId, body.tags);
      return { message: 'Tags removed successfully' };
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to remove tags');
    }
  }

  @Get('stats')
  @ApiOperation({
    summary: 'Get analysis statistics',
    description: 'Get statistics about user\'s analysis history',
  })
  @ApiResponse({
    status: 200,
    description: 'Statistics retrieved successfully',
  })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async getAnalysisStats(@Request() req): Promise<any> {
    try {
      const userId = req.user.sub;
      return await this.profileScoutService.getAnalysisStats(userId);
    } catch (error) {
      throw new InternalServerErrorException('Failed to fetch analysis statistics');
    }
  }

  @Post('resolve-youtube-channel')
  @ApiOperation({
    summary: 'Resolve YouTube channel ID',
    description: 'Resolve YouTube channel ID from username, custom URL, or full URL',
  })
  @ApiResponse({
    status: 200,
    description: 'Channel ID resolved successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 404, description: 'Channel not found' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async resolveYouTubeChannelId(
    @Body() body: { input: string },
    @Request() req,
  ): Promise<{ channelId: string }> {
    try {
      if (!body.input || typeof body.input !== 'string') {
        throw new BadRequestException('Input is required and must be a string');
      }

      const channelId = await this.profileScoutService.resolveYouTubeChannelId(body.input);
      return { channelId };
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to resolve YouTube channel ID');
    }
  }
}
