import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongoDBMetricsService } from '../../monitoring/services/mongodb-metrics.service';

export interface QuotaUsage {
  endpoint: string;
  cost: number;
  timestamp: Date;
  remaining?: number;
}

export interface QuotaStatus {
  isQuotaExceeded: boolean;
  remainingQuota: number;
  dailyUsage: number;
  resetTime: Date;
  warnings: string[];
}

@Injectable()
export class YouTubeQuotaMonitorService {
  private readonly logger = new Logger(YouTubeQuotaMonitorService.name);
  private readonly dailyQuotaLimit: number;
  private readonly warningThreshold: number; // 80% of quota
  private readonly criticalThreshold: number; // 95% of quota

  // YouTube API v3 quota costs (in units)
  private readonly quotaCosts = {
    'search': 100,
    'channels': 1,
    'videos': 1,
    'playlists': 1,
    'playlistItems': 1,
    'comments': 1,
    'commentThreads': 1,
    'activities': 1,
    'subscriptions': 1,
    'captions': 1,
    'i18nRegions': 1,
    'i18nLanguages': 1,
  };

  constructor(
    private readonly configService: ConfigService,
    private readonly metricsService: MongoDBMetricsService,
  ) {
    // YouTube API v3 has a default quota of 10,000 units per day
    this.dailyQuotaLimit = this.configService.get<number>('YOUTUBE_DAILY_QUOTA_LIMIT') || 10000;
    this.warningThreshold = this.dailyQuotaLimit * 0.8; // 80%
    this.criticalThreshold = this.dailyQuotaLimit * 0.95; // 95%
  }

  /**
   * Record quota usage for a specific API call
   */
  async recordQuotaUsage(endpoint: string, cost?: number): Promise<void> {
    try {
      const actualCost = cost || this.quotaCosts[endpoint] || 1;
      const usage: QuotaUsage = {
        endpoint,
        cost: actualCost,
        timestamp: new Date(),
      };

      // Record in metrics
      await this.metricsService.writeMetric(
        'youtube_quota_usage',
        { endpoint },
        { cost: actualCost, timestamp: new Date() }
      );

      this.logger.debug(`Recorded quota usage: ${endpoint} - ${actualCost} units`);

      // Check if we need to send warnings
      await this.checkQuotaStatus();
    } catch (error) {
      this.logger.error(`Failed to record quota usage: ${error.message}`);
    }
  }

  /**
   * Check current quota status and send warnings if needed
   */
  async checkQuotaStatus(): Promise<QuotaStatus> {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      // Get today's usage
      const usageData = await this.metricsService.queryMetrics({
        measurement: 'youtube_quota_usage',
        startTime: today,
        endTime: tomorrow,
        fields: ['cost'],
        groupBy: 'endpoint',
      });

      const dailyUsage = usageData.reduce((total, data) => total + (data.cost || 0), 0);
      const remainingQuota = this.dailyQuotaLimit - dailyUsage;
      const isQuotaExceeded = remainingQuota <= 0;

      const warnings: string[] = [];
      if (dailyUsage >= this.criticalThreshold) {
        warnings.push('CRITICAL: YouTube API quota is at 95% or higher');
      } else if (dailyUsage >= this.warningThreshold) {
        warnings.push('WARNING: YouTube API quota is at 80% or higher');
      }

      const status: QuotaStatus = {
        isQuotaExceeded,
        remainingQuota,
        dailyUsage,
        resetTime: tomorrow,
        warnings,
      };

      // Log warnings
      if (warnings.length > 0) {
        this.logger.warn(`YouTube Quota Status: ${warnings.join(', ')}. Usage: ${dailyUsage}/${this.dailyQuotaLimit}`);
      }

      return status;
    } catch (error) {
      this.logger.error(`Failed to check quota status: ${error.message}`);
      return {
        isQuotaExceeded: false,
        remainingQuota: this.dailyQuotaLimit,
        dailyUsage: 0,
        resetTime: new Date(),
        warnings: [],
      };
    }
  }

  /**
   * Check if we can make a request without exceeding quota
   */
  async canMakeRequest(endpoint: string, cost?: number): Promise<boolean> {
    try {
      const actualCost = cost || this.quotaCosts[endpoint] || 1;
      const status = await this.checkQuotaStatus();

      return status.remainingQuota >= actualCost;
    } catch (error) {
      this.logger.error(`Failed to check if request can be made: ${error.message}`);
      return false; // Fail safe - don't make request if we can't check
    }
  }

  /**
   * Get quota usage statistics for a date range
   */
  async getQuotaUsageStats(startDate: Date, endDate: Date): Promise<any> {
    try {
      const usageData = await this.metricsService.queryMetrics({
        measurement: 'youtube_quota_usage',
        startTime: startDate,
        endTime: endDate,
        fields: ['cost'],
        groupBy: 'endpoint',
        interval: '1h',
      });

      const totalUsage = usageData.reduce((total, data) => total + (data.cost || 0), 0);
      const endpointBreakdown = usageData.reduce((acc, data) => {
        acc[data.endpoint] = (acc[data.endpoint] || 0) + (data.cost || 0);
        return acc;
      }, {});

      return {
        totalUsage,
        endpointBreakdown,
        dailyLimit: this.dailyQuotaLimit,
        utilizationPercentage: (totalUsage / this.dailyQuotaLimit) * 100,
        period: { startDate, endDate },
      };
    } catch (error) {
      this.logger.error(`Failed to get quota usage stats: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get quota cost for a specific endpoint
   */
  getQuotaCost(endpoint: string): number {
    return this.quotaCosts[endpoint] || 1;
  }

  /**
   * Estimate remaining requests for an endpoint
   */
  async getRemainingRequests(endpoint: string): Promise<number> {
    try {
      const status = await this.checkQuotaStatus();
      const cost = this.getQuotaCost(endpoint);
      return Math.floor(status.remainingQuota / cost);
    } catch (error) {
      this.logger.error(`Failed to get remaining requests: ${error.message}`);
      return 0;
    }
  }

  /**
   * Send quota exceeded notification (placeholder for future implementation)
   */
  private async sendQuotaExceededNotification(): Promise<void> {
    // TODO: Implement notification system (email, Slack, etc.)
    this.logger.error('🚨 YouTube API quota exceeded! All YouTube operations will fail until quota resets.');
  }

  /**
   * Send quota warning notification (placeholder for future implementation)
   */
  private async sendQuotaWarningNotification(usage: number, threshold: number): Promise<void> {
    // TODO: Implement notification system
    this.logger.warn(`⚠️ YouTube API quota warning: ${usage} units used (${threshold} threshold reached)`);
  }
}

