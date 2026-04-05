import { Injectable, Logger, BadRequestException, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AnalysisHistory, AnalysisHistoryDocument, AnalysisStatus, AnalysisPlatform } from '../schemas/analysis-history.schema';
import { ProfileScoutRequestDto } from '../dto/profile-scout-request.dto';
import { ProfileScoutResponseDto } from '../dto/profile-scout-response.dto';

@Injectable()
export class AnalysisHistoryService {
  private readonly logger = new Logger(AnalysisHistoryService.name);

  constructor(
    @InjectModel(AnalysisHistory.name)
    private readonly analysisHistoryModel: Model<AnalysisHistoryDocument>,
  ) {}

  /**
   * Create a new analysis history entry
   */
  async createAnalysis(
    userId: string,
    request: ProfileScoutRequestDto,
  ): Promise<AnalysisHistoryDocument> {
    try {
      this.logger.log(`Creating analysis history for user ${userId}, target: ${request.username}`);

      // Check for recent duplicate analysis (within last 24 hours)
      const recentAnalysis = await this.analysisHistoryModel.findOne({
        userId: new Types.ObjectId(userId),
        platform: request.platform,
        targetUsername: request.username,
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        status: { $in: [AnalysisStatus.COMPLETED, AnalysisStatus.IN_PROGRESS] },
      });

      if (recentAnalysis) {
        this.logger.log(`Found recent analysis for ${request.username}, returning existing entry`);
        return recentAnalysis;
      }

      const analysis = new this.analysisHistoryModel({
        userId: new Types.ObjectId(userId),
        platform: request.platform,
        targetUsername: request.username,
        status: AnalysisStatus.PENDING,
        requestData: request,
        startedAt: new Date(),
        progress: 0,
        apiCallsCount: 0,
      });

      const savedAnalysis = await analysis.save();
      this.logger.log(`Created analysis history with ID: ${savedAnalysis._id}`);

      return savedAnalysis;
    } catch (error) {
      this.logger.error(`Failed to create analysis history: ${error.message}`);
      throw new InternalServerErrorException('Failed to create analysis history');
    }
  }

  /**
   * Update analysis status and progress
   */
  async updateAnalysisStatus(
    analysisId: string,
    status: AnalysisStatus,
    progress?: number,
    errorMessage?: string,
    errorCode?: string,
  ): Promise<void> {
    try {
      const updateData: any = { status };

      if (progress !== undefined) {
        updateData.progress = progress;
      }

      if (status === AnalysisStatus.COMPLETED) {
        updateData.completedAt = new Date();
      }

      if (errorMessage) {
        updateData.errorMessage = errorMessage;
        updateData.errorCode = errorCode;
      }

      await this.analysisHistoryModel.findByIdAndUpdate(analysisId, updateData);

      this.logger.log(`Updated analysis ${analysisId} status to ${status}, progress: ${progress || 'N/A'}`);
    } catch (error) {
      this.logger.error(`Failed to update analysis status: ${error.message}`);
      throw new InternalServerErrorException('Failed to update analysis status');
    }
  }

  /**
   * Save analysis results
   */
  async saveAnalysisResults(
    analysisId: string,
    results: ProfileScoutResponseDto,
    processingTimeMs: number,
    apiCallsCount: number,
  ): Promise<void> {
    try {
      await this.analysisHistoryModel.findByIdAndUpdate(analysisId, {
        resultData: results,
        processingTimeMs,
        apiCallsCount,
        completedAt: new Date(),
        status: AnalysisStatus.COMPLETED,
        progress: 100,
      });

      this.logger.log(`Saved analysis results for ${analysisId}, processing time: ${processingTimeMs}ms`);
    } catch (error) {
      this.logger.error(`Failed to save analysis results: ${error.message}`);
      throw new InternalServerErrorException('Failed to save analysis results');
    }
  }

  /**
   * Get analysis history for a user
   */
  async getAnalysisHistory(
    userId: string,
    limit: number = 20,
    offset: number = 0,
    platform?: AnalysisPlatform,
    status?: AnalysisStatus,
  ): Promise<{ analyses: AnalysisHistoryDocument[]; total: number }> {
    try {
      this.logger.log(`Fetching analysis history for user ${userId}`);

      const query: any = { userId: new Types.ObjectId(userId) };

      if (platform) {
        query.platform = platform;
      }

      if (status) {
        query.status = status;
      }

      const [analyses, total] = await Promise.all([
        this.analysisHistoryModel
          .find(query)
          .sort({ createdAt: -1 })
          .skip(offset)
          .limit(limit)
          .exec(),
        this.analysisHistoryModel.countDocuments(query),
      ]);

      this.logger.log(`Found ${analyses.length} analyses for user ${userId}`);

      return { analyses, total };
    } catch (error) {
      this.logger.error(`Failed to fetch analysis history: ${error.message}`);
      throw new InternalServerErrorException('Failed to fetch analysis history');
    }
  }

  /**
   * Get analysis by ID
   */
  async getAnalysisById(analysisId: string): Promise<AnalysisHistoryDocument> {
    try {
      const analysis = await this.analysisHistoryModel.findById(analysisId);

      if (!analysis) {
        throw new NotFoundException(`Analysis not found: ${analysisId}`);
      }

      return analysis;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      this.logger.error(`Failed to fetch analysis by ID: ${error.message}`);
      throw new InternalServerErrorException('Failed to fetch analysis');
    }
  }

  /**
   * Get analysis by ID with user validation
   */
  async getAnalysisByIdForUser(analysisId: string, userId: string): Promise<AnalysisHistoryDocument> {
    try {
      // Check if it's the old format (starts with "analysis_")
      if (analysisId.startsWith('analysis_')) {
        throw new NotFoundException(
          `Analysis not found: ${analysisId}. This appears to be an old format ID. Please create a new analysis to get a valid ID.`
        );
      }

      // New format - use as ObjectId
      const analysis = await this.analysisHistoryModel.findOne({
        _id: new Types.ObjectId(analysisId),
        userId: new Types.ObjectId(userId),
      });

      if (!analysis) {
        throw new NotFoundException(`Analysis not found: ${analysisId}`);
      }

      return analysis;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      this.logger.error(`Failed to fetch analysis for user: ${error.message}`);
      throw new InternalServerErrorException('Failed to fetch analysis');
    }
  }

  /**
   * Delete analysis
   */
  async deleteAnalysis(analysisId: string, userId: string): Promise<void> {
    try {
      // Check if it's the old format (starts with "analysis_")
      if (analysisId.startsWith('analysis_')) {
        throw new NotFoundException(
          `Analysis not found: ${analysisId}. This appears to be an old format ID. Please create a new analysis to get a valid ID.`
        );
      }

      const result = await this.analysisHistoryModel.deleteOne({
        _id: new Types.ObjectId(analysisId),
        userId: new Types.ObjectId(userId),
      });

      if (result.deletedCount === 0) {
        throw new NotFoundException(`Analysis not found: ${analysisId}`);
      }

      this.logger.log(`Deleted analysis ${analysisId} for user ${userId}`);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      this.logger.error(`Failed to delete analysis: ${error.message}`);
      throw new InternalServerErrorException('Failed to delete analysis');
    }
  }

  /**
   * Toggle favorite status
   */
  async toggleFavorite(analysisId: string, userId: string): Promise<boolean> {
    try {
      const analysis = await this.getAnalysisByIdForUser(analysisId, userId);

      const newFavoriteStatus = !analysis.isFavorite;

      await this.analysisHistoryModel.findByIdAndUpdate(analysisId, {
        isFavorite: newFavoriteStatus,
      });

      this.logger.log(`Toggled favorite status for analysis ${analysisId} to ${newFavoriteStatus}`);

      return newFavoriteStatus;
    } catch (error) {
      this.logger.error(`Failed to toggle favorite: ${error.message}`);
      throw new InternalServerErrorException('Failed to toggle favorite status');
    }
  }

  /**
   * Add notes to analysis
   */
  async addNotes(analysisId: string, userId: string, notes: string): Promise<void> {
    try {
      await this.getAnalysisByIdForUser(analysisId, userId); // Validate access

      await this.analysisHistoryModel.findByIdAndUpdate(analysisId, { notes });

      this.logger.log(`Added notes to analysis ${analysisId}`);
    } catch (error) {
      this.logger.error(`Failed to add notes: ${error.message}`);
      throw new InternalServerErrorException('Failed to add notes');
    }
  }

  /**
   * Add tags to analysis
   */
  async addTags(analysisId: string, userId: string, tags: string[]): Promise<void> {
    try {
      const analysis = await this.getAnalysisByIdForUser(analysisId, userId);

      const existingTags = analysis.tags || [];
      const newTags = tags.filter(tag => !existingTags.includes(tag));

      if (newTags.length > 0) {
        await this.analysisHistoryModel.findByIdAndUpdate(analysisId, {
          $addToSet: { tags: { $each: newTags } },
        });

        this.logger.log(`Added tags to analysis ${analysisId}: ${newTags.join(', ')}`);
      }
    } catch (error) {
      this.logger.error(`Failed to add tags: ${error.message}`);
      throw new InternalServerErrorException('Failed to add tags');
    }
  }

  /**
   * Remove tags from analysis
   */
  async removeTags(analysisId: string, userId: string, tags: string[]): Promise<void> {
    try {
      await this.getAnalysisByIdForUser(analysisId, userId); // Validate access

      await this.analysisHistoryModel.findByIdAndUpdate(analysisId, {
        $pull: { tags: { $in: tags } },
      });

      this.logger.log(`Removed tags from analysis ${analysisId}: ${tags.join(', ')}`);
    } catch (error) {
      this.logger.error(`Failed to remove tags: ${error.message}`);
      throw new InternalServerErrorException('Failed to remove tags');
    }
  }

  /**
   * Get analysis statistics for a user
   */
  async getAnalysisStats(userId: string): Promise<{
    total: number;
    completed: number;
    failed: number;
    pending: number;
    averageProcessingTime: number;
    totalApiCalls: number;
  }> {
    try {
      const stats = await this.analysisHistoryModel.aggregate([
        { $match: { userId: new Types.ObjectId(userId) } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            completed: { $sum: { $cond: [{ $eq: ['$status', AnalysisStatus.COMPLETED] }, 1, 0] } },
            failed: { $sum: { $cond: [{ $eq: ['$status', AnalysisStatus.FAILED] }, 1, 0] } },
            pending: { $sum: { $cond: [{ $eq: ['$status', AnalysisStatus.PENDING] }, 1, 0] } },
            totalProcessingTime: { $sum: '$processingTimeMs' },
            totalApiCalls: { $sum: '$apiCallsCount' },
          },
        },
      ]);

      const result = stats[0] || {
        total: 0,
        completed: 0,
        failed: 0,
        pending: 0,
        totalProcessingTime: 0,
        totalApiCalls: 0,
      };

      return {
        total: result.total,
        completed: result.completed,
        failed: result.failed,
        pending: result.pending,
        averageProcessingTime: result.completed > 0 ? Math.round(result.totalProcessingTime / result.completed) : 0,
        totalApiCalls: result.totalApiCalls,
      };
    } catch (error) {
      this.logger.error(`Failed to get analysis stats: ${error.message}`);
      throw new InternalServerErrorException('Failed to get analysis statistics');
    }
  }

  /**
   * Clean up old failed analyses (older than 7 days)
   */
  async cleanupOldFailedAnalyses(): Promise<number> {
    try {
      const cutoffDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      const result = await this.analysisHistoryModel.deleteMany({
        status: AnalysisStatus.FAILED,
        createdAt: { $lt: cutoffDate },
      });

      this.logger.log(`Cleaned up ${result.deletedCount} old failed analyses`);
      return result.deletedCount;
    } catch (error) {
      this.logger.error(`Failed to cleanup old analyses: ${error.message}`);
      return 0;
    }
  }

  /**
   * Get pending analyses for background processing
   */
  async getPendingAnalyses(limit: number = 10): Promise<AnalysisHistoryDocument[]> {
    try {
      return await this.analysisHistoryModel
        .find({ status: AnalysisStatus.PENDING })
        .sort({ createdAt: 1 })
        .limit(limit)
        .exec();
    } catch (error) {
      this.logger.error(`Failed to get pending analyses: ${error.message}`);
      return [];
    }
  }

  /**
   * Mark analysis as failed with error details
   */
  async markAnalysisAsFailed(
    analysisId: string,
    errorMessage: string,
    errorCode?: string,
  ): Promise<void> {
    try {
      await this.analysisHistoryModel.findByIdAndUpdate(analysisId, {
        status: AnalysisStatus.FAILED,
        errorMessage,
        errorCode,
        completedAt: new Date(),
        progress: 0,
      });

      this.logger.error(`Marked analysis ${analysisId} as failed: ${errorMessage}`);
    } catch (error) {
      this.logger.error(`Failed to mark analysis as failed: ${error.message}`);
    }
  }
}
