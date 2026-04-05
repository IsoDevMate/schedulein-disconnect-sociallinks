import { Injectable, Logger, BadRequestException, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { ReportGeneratorService } from './services/report-generator.service';
import { YouTubeProfileService } from './services/youtube-profile.service';
import { AnalysisHistoryService } from './services/analysis-history.service';
import { YouTubeChannelResolverService } from '../../youtube/services/youtube-channel-resolver.service';
import { ProfileScoutRequestDto, ProfilePlatform } from './dto/profile-scout-request.dto';
import { ProfileScoutResponseDto } from './dto/profile-scout-response.dto';
import { AnalysisStatus } from './schemas/analysis-history.schema';

@Injectable()
export class ProfileScoutService {
  private readonly logger = new Logger(ProfileScoutService.name);

  constructor(
    private readonly reportGeneratorService: ReportGeneratorService,
    private readonly youtubeProfileService: YouTubeProfileService,
    private readonly analysisHistoryService: AnalysisHistoryService,
    private readonly channelResolver: YouTubeChannelResolverService,
  ) {}

  /**
   * Analyze a profile and generate comprehensive report with history tracking
   */
  async analyzeProfile(request: ProfileScoutRequestDto, userId: string): Promise<ProfileScoutResponseDto> {
    const startTime = Date.now();
    let apiCallsCount = 0;
    let analysisId: string;

    try {
      this.logger.log(`Starting Profile Scout analysis for ${request.platform} user: ${request.username}`);

      // Validate request
      this.validateRequest(request);

      // Create analysis history entry
      const analysisHistory = await this.analysisHistoryService.createAnalysis(userId, request);
      analysisId = analysisHistory._id.toString();

      // Update status to in progress
      await this.analysisHistoryService.updateAnalysisStatus(analysisId, AnalysisStatus.IN_PROGRESS, 10);

            // Resolve channel ID if it's YouTube
      if (request.platform === ProfilePlatform.YOUTUBE) {
        try {
          const channelData = await this.channelResolver.resolveChannel(request.username);
          this.logger.log(`Resolved YouTube channel ID: ${channelData.channelId} for username: ${request.username}`);
          apiCallsCount++;

          // Update progress
          await this.analysisHistoryService.updateAnalysisStatus(analysisId, AnalysisStatus.IN_PROGRESS, 30);
        } catch (error) {
          this.logger.error(`Failed to resolve YouTube channel ID: ${error.message}`);

          // Handle quota exceeded errors specifically
          if (error.message?.includes('quota') || error.message?.includes('QUOTA_EXCEEDED')) {
            await this.analysisHistoryService.markAnalysisAsFailed(
              analysisId,
              'YouTube API quota exceeded. Please try again later.',
              'QUOTA_EXCEEDED'
            );
            throw new InternalServerErrorException({
              message: 'YouTube API quota exceeded',
              details: 'The YouTube API quota has been exceeded. Please try again later.',
              code: 'QUOTA_EXCEEDED'
            });
          }

          await this.analysisHistoryService.markAnalysisAsFailed(analysisId, `Channel ID resolution failed: ${error.message}`, 'CHANNEL_RESOLUTION_ERROR');
          throw error;
        }
      }

      // Generate comprehensive report
      const report = await this.reportGeneratorService.generateReport(
        request.platform,
        request.username,
        request.includeIdeaSpark,
        request.maxVideos,
        analysisId,
        userId,
      );

      // Update progress to 90%
      await this.analysisHistoryService.updateAnalysisStatus(analysisId, AnalysisStatus.IN_PROGRESS, 90);

      const processingTimeMs = Date.now() - startTime;

      // Save analysis results
      await this.analysisHistoryService.saveAnalysisResults(
        analysisId,
        report,
        processingTimeMs,
        apiCallsCount,
      );

      this.logger.log(`Profile Scout analysis completed for ${request.username} in ${processingTimeMs}ms`);
      return report;

    } catch (error) {
      this.logger.error(`Profile Scout analysis failed: ${error.message}`);

      // Mark analysis as failed if we have an analysis ID
      if (analysisId) {
        await this.analysisHistoryService.markAnalysisAsFailed(
          analysisId,
          error.message,
          this.getErrorCode(error),
        );
      }

      // Re-throw with appropriate error type
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        throw error;
      }

      throw new InternalServerErrorException(`Profile analysis failed: ${error.message}`);
    }
  }

  /**
   * Get analysis history for a user with proper error handling
   */
  async getAnalysisHistory(
    userId: string,
    limit: number = 20,
    offset: number = 0,
    platform?: string,
    status?: string,
  ): Promise<{ analyses: any[]; total: number }> {
    try {
      this.logger.log(`Fetching analysis history for user: ${userId}`);

      return await this.analysisHistoryService.getAnalysisHistory(
        userId,
        limit,
        offset,
        platform as any,
        status as any,
      );
    } catch (error) {
      this.logger.error(`Failed to fetch analysis history: ${error.message}`);

      if (error instanceof InternalServerErrorException) {
        throw error;
      }

      throw new InternalServerErrorException('Failed to fetch analysis history');
    }
  }

  /**
   * Get analysis by ID with user validation
   */
  async getAnalysisById(analysisId: string, userId: string): Promise<any> {
    try {
      this.logger.log(`Fetching analysis by ID: ${analysisId} for user: ${userId}`);

      return await this.analysisHistoryService.getAnalysisByIdForUser(analysisId, userId);
    } catch (error) {
      this.logger.error(`Failed to fetch analysis by ID: ${error.message}`);

      if (error instanceof NotFoundException) {
        throw error;
      }

      throw new InternalServerErrorException('Failed to fetch analysis');
    }
  }

  /**
   * Delete analysis with user validation
   */
  async deleteAnalysis(analysisId: string, userId: string): Promise<void> {
    try {
      this.logger.log(`Deleting analysis: ${analysisId} for user: ${userId}`);

      await this.analysisHistoryService.deleteAnalysis(analysisId, userId);
    } catch (error) {
      this.logger.error(`Failed to delete analysis: ${error.message}`);

      if (error instanceof NotFoundException) {
        throw error;
      }

      throw new InternalServerErrorException('Failed to delete analysis');
    }
  }

  /**
   * Toggle favorite status for an analysis
   */
  async toggleFavorite(analysisId: string, userId: string): Promise<{ isFavorite: boolean }> {
    try {
      this.logger.log(`Toggling favorite for analysis: ${analysisId} for user: ${userId}`);

      const isFavorite = await this.analysisHistoryService.toggleFavorite(analysisId, userId);
      return { isFavorite };
    } catch (error) {
      this.logger.error(`Failed to toggle favorite: ${error.message}`);
      throw new InternalServerErrorException('Failed to toggle favorite status');
    }
  }

  /**
   * Add notes to an analysis
   */
  async addNotes(analysisId: string, userId: string, notes: string): Promise<void> {
    try {
      this.logger.log(`Adding notes to analysis: ${analysisId} for user: ${userId}`);

      if (!notes || notes.trim().length === 0) {
        throw new BadRequestException('Notes cannot be empty');
      }

      if (notes.length > 1000) {
        throw new BadRequestException('Notes cannot exceed 1000 characters');
      }

      await this.analysisHistoryService.addNotes(analysisId, userId, notes.trim());
    } catch (error) {
      this.logger.error(`Failed to add notes: ${error.message}`);

      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new InternalServerErrorException('Failed to add notes');
    }
  }

  /**
   * Add tags to an analysis
   */
  async addTags(analysisId: string, userId: string, tags: string[]): Promise<void> {
    try {
      this.logger.log(`Adding tags to analysis: ${analysisId} for user: ${userId}`);

      if (!tags || tags.length === 0) {
        throw new BadRequestException('Tags cannot be empty');
      }

      // Validate tags
      const validTags = tags.filter(tag => {
        const trimmedTag = tag.trim();
        return trimmedTag.length > 0 &&
               trimmedTag.length <= 50 &&
               /^[a-zA-Z0-9\s\-_]+$/.test(trimmedTag);
      });

      if (validTags.length === 0) {
        throw new BadRequestException('No valid tags provided');
      }

      if (validTags.length > 10) {
        throw new BadRequestException('Cannot add more than 10 tags at once');
      }

      await this.analysisHistoryService.addTags(analysisId, userId, validTags);
    } catch (error) {
      this.logger.error(`Failed to add tags: ${error.message}`);

      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new InternalServerErrorException('Failed to add tags');
    }
  }

  /**
   * Remove tags from an analysis
   */
  async removeTags(analysisId: string, userId: string, tags: string[]): Promise<void> {
    try {
      this.logger.log(`Removing tags from analysis: ${analysisId} for user: ${userId}`);

      if (!tags || tags.length === 0) {
        throw new BadRequestException('Tags cannot be empty');
      }

      await this.analysisHistoryService.removeTags(analysisId, userId, tags);
    } catch (error) {
      this.logger.error(`Failed to remove tags: ${error.message}`);

      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new InternalServerErrorException('Failed to remove tags');
    }
  }

  /**
   * Get analysis statistics for a user
   */
  async getAnalysisStats(userId: string): Promise<any> {
    try {
      this.logger.log(`Fetching analysis stats for user: ${userId}`);

      return await this.analysisHistoryService.getAnalysisStats(userId);
    } catch (error) {
      this.logger.error(`Failed to fetch analysis stats: ${error.message}`);
      throw new InternalServerErrorException('Failed to fetch analysis statistics');
    }
  }

    /**
   * Resolve YouTube channel ID (utility method)
   */
  async resolveYouTubeChannelId(input: string): Promise<string> {
    try {
      this.logger.log(`Resolving YouTube channel ID for: ${input}`);

      const channelData = await this.channelResolver.resolveChannel(input);
      return channelData.channelId;
    } catch (error) {
      this.logger.error(`Failed to resolve YouTube channel ID: ${error.message}`);

      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }

      throw new InternalServerErrorException('Failed to resolve YouTube channel ID');
    }
  }

  /**
   * Validate request parameters with enhanced error handling
   */
  private validateRequest(request: ProfileScoutRequestDto): void {
    const errors: string[] = [];

    if (!request.username || request.username.trim().length === 0) {
      errors.push('Username is required');
    }

    if (!request.platform) {
      errors.push('Platform is required');
    }

    if (request.maxVideos && (request.maxVideos < 1 || request.maxVideos > 50)) {
      errors.push('Max videos must be between 1 and 50');
    }

    if (errors.length > 0) {
      throw new BadRequestException(errors.join('; '));
    }

    // Clean username (remove @ symbol if present)
    request.username = request.username.replace(/^@/, '');

    // Validate username format based on platform
    if (request.platform === ProfilePlatform.YOUTUBE) {
      // More flexible validation for YouTube usernames (allows spaces, apostrophes, etc.)
      if (!/^[a-zA-Z0-9\s._'-]+$/.test(request.username) || request.username.length < 3 || request.username.length > 50) {
        errors.push('Invalid YouTube username format');
      }
    } else if (request.platform === ProfilePlatform.TIKTOK) {
      // More flexible validation for TikTok usernames (allows spaces, apostrophes, etc.)
      if (!/^[a-zA-Z0-9\s._'-]+$/.test(request.username) || request.username.length < 3 || request.username.length > 50) {
        errors.push('Invalid TikTok username format');
      }
    }

    if (errors.length > 0) {
      throw new BadRequestException(errors.join('; '));
    }
  }

  /**
   * Get error code from error object
   */
  private getErrorCode(error: any): string {
    if (error instanceof BadRequestException) {
      return 'VALIDATION_ERROR';
    }
    if (error instanceof NotFoundException) {
      return 'NOT_FOUND';
    }
    if (error.message?.includes('quota') || error.message?.includes('QUOTA_EXCEEDED')) {
      return 'QUOTA_EXCEEDED';
    }
    if (error.message?.includes('rate limit')) {
      return 'RATE_LIMIT_EXCEEDED';
    }
    if (error.message?.includes('network')) {
      return 'NETWORK_ERROR';
    }
    if (error.message?.includes('Channel ID resolution failed')) {
      return 'CHANNEL_RESOLUTION_ERROR';
    }
    return 'UNKNOWN_ERROR';
  }

  /**
   * Check if user has enough credits for analysis (placeholder for future implementation)
   */
  private async checkUserCredits(userId: string): Promise<boolean> {
    // TODO: Implement credit checking logic
    return true;
  }
}
