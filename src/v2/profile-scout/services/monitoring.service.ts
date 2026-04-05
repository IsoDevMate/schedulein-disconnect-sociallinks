import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AnalysisHistory, AnalysisHistoryDocument, AnalysisStatus } from '../schemas/analysis-history.schema';

interface HealthMetrics {
  totalAnalyses: number;
  successRate: number;
  avgProcessingTime: number;
  failureReasons: { [key: string]: number };
  platformSuccessRates: { [platform: string]: number };
  recentErrors: string[];
  systemLoad: {
    memory: number;
    cpu: number;
  };
}

@Injectable()
export class ProfileScoutMonitoringService {
  private readonly logger = new Logger(ProfileScoutMonitoringService.name);
  private healthMetrics: HealthMetrics = {
    totalAnalyses: 0,
    successRate: 0,
    avgProcessingTime: 0,
    failureReasons: {},
    platformSuccessRates: {},
    recentErrors: [],
    systemLoad: { memory: 0, cpu: 0 }
  };

  constructor(
    @InjectModel(AnalysisHistory.name)
    private readonly analysisHistoryModel: Model<AnalysisHistoryDocument>,
  ) {}

  /**
   * Get current system health metrics
   */
  async getHealthMetrics(): Promise<HealthMetrics> {
    await this.updateHealthMetrics();
    return this.healthMetrics;
  }

  /**
   * Update health metrics from database
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async updateHealthMetrics(): Promise<void> {
    try {
      const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);

      // Get analyses from last 24 hours
      const recentAnalyses = await this.analysisHistoryModel.find({
        createdAt: { $gte: last24Hours }
      });

      if (recentAnalyses.length === 0) {
        this.logger.warn('No analyses found in the last 24 hours');
        return;
      }

      const completed = recentAnalyses.filter(a => a.status === AnalysisStatus.COMPLETED);
      const failed = recentAnalyses.filter(a => a.status === AnalysisStatus.FAILED);

      // Calculate success rate
      this.healthMetrics.totalAnalyses = recentAnalyses.length;
      this.healthMetrics.successRate = (completed.length / recentAnalyses.length) * 100;

      // Calculate average processing time
      const completedWithTime = completed.filter(a => a.processingTimeMs);
      this.healthMetrics.avgProcessingTime = completedWithTime.length > 0 ?
        completedWithTime.reduce((sum, a) => sum + a.processingTimeMs, 0) / completedWithTime.length :
        0;

      // Analyze failure reasons
      this.healthMetrics.failureReasons = {};
      failed.forEach(analysis => {
        const errorCode = analysis.errorCode || 'UNKNOWN_ERROR';
        this.healthMetrics.failureReasons[errorCode] =
          (this.healthMetrics.failureReasons[errorCode] || 0) + 1;
      });

      // Calculate platform success rates
      this.healthMetrics.platformSuccessRates = {};
      const platforms = ['tiktok', 'youtube'];

      for (const platform of platforms) {
        const platformAnalyses = recentAnalyses.filter(a => a.platform === platform);
        const platformCompleted = platformAnalyses.filter(a => a.status === AnalysisStatus.COMPLETED);

        if (platformAnalyses.length > 0) {
          this.healthMetrics.platformSuccessRates[platform] =
            (platformCompleted.length / platformAnalyses.length) * 100;
        }
      }

      // Get recent errors
      this.healthMetrics.recentErrors = failed
        .slice(-10)
        .map(a => `${a.platform}:${a.targetUsername} - ${a.errorMessage}`)
        .filter(Boolean);

      // Get system load (basic implementation)
      this.healthMetrics.systemLoad = await this.getSystemLoad();

      // Check for alerts
      await this.checkAndSendAlerts();

    } catch (error) {
      this.logger.error(`Error updating health metrics: ${error.message}`);
    }
  }

  /**
   * Check for alert conditions and log warnings
   */
  private async checkAndSendAlerts(): Promise<void> {
    const metrics = this.healthMetrics;

    // Success rate alerts
    if (metrics.successRate < 50) {
      this.logger.error(`🚨 CRITICAL: Success rate is ${metrics.successRate.toFixed(1)}% (below 50%)`);
    } else if (metrics.successRate < 75) {
      this.logger.warn(`⚠️ WARNING: Success rate is ${metrics.successRate.toFixed(1)}% (below 75%)`);
    }

    // Processing time alerts
    if (metrics.avgProcessingTime > 60000) { // 1 minute
      this.logger.warn(`⚠️ WARNING: Average processing time is ${(metrics.avgProcessingTime / 1000).toFixed(1)}s (above 60s)`);
    }

    // Platform-specific alerts
    Object.entries(metrics.platformSuccessRates).forEach(([platform, rate]) => {
      if (rate < 30) {
        this.logger.error(`🚨 CRITICAL: ${platform} success rate is ${rate.toFixed(1)}% (below 30%)`);
      } else if (rate < 60) {
        this.logger.warn(`⚠️ WARNING: ${platform} success rate is ${rate.toFixed(1)}% (below 60%)`);
      }
    });

    // Error pattern detection
    const topErrors = Object.entries(metrics.failureReasons)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3);

    topErrors.forEach(([error, count]) => {
      if (count > 5) {
        this.logger.warn(`⚠️ WARNING: High frequency error: ${error} (${count} occurrences)`);
      }
    });
  }

  /**
   * Get basic system load metrics
   */
  private async getSystemLoad(): Promise<{ memory: number; cpu: number }> {
    try {
      const used = process.memoryUsage();
      const memoryUsage = (used.heapUsed / used.heapTotal) * 100;

      // CPU usage would require additional libraries in production
      // For now, return mock data
      return {
        memory: memoryUsage,
        cpu: Math.random() * 100 // Mock CPU usage
      };
    } catch (error) {
      this.logger.error(`Error getting system load: ${error.message}`);
      return { memory: 0, cpu: 0 };
    }
  }

  /**
   * Clean up old pending analyses (stuck analyses)
   */
  @Cron(CronExpression.EVERY_HOUR)
  async cleanupStuckAnalyses(): Promise<void> {
    try {
      const cutoffTime = new Date(Date.now() - 30 * 60 * 1000); // 30 minutes ago

      const stuckAnalyses = await this.analysisHistoryModel.find({
        status: { $in: [AnalysisStatus.PENDING, AnalysisStatus.IN_PROGRESS] },
        createdAt: { $lt: cutoffTime }
      });

      if (stuckAnalyses.length > 0) {
        this.logger.warn(`Found ${stuckAnalyses.length} stuck analyses, marking as failed`);

        await this.analysisHistoryModel.updateMany(
          {
            _id: { $in: stuckAnalyses.map(a => a._id) }
          },
          {
            status: AnalysisStatus.FAILED,
            errorMessage: 'Analysis timed out - marked as failed by cleanup job',
            errorCode: 'CLEANUP_TIMEOUT',
            completedAt: new Date()
          }
        );

        this.logger.log(`Cleaned up ${stuckAnalyses.length} stuck analyses`);
      }
    } catch (error) {
      this.logger.error(`Error cleaning up stuck analyses: ${error.message}`);
    }
  }

  /**
   * Get detailed error analysis
   */
  async getErrorAnalysis(hours: number = 24): Promise<{
    errorsByPlatform: { [platform: string]: { [error: string]: number } };
    errorTrends: { timestamp: Date; errorCount: number }[];
    commonErrorPatterns: string[];
  }> {
    try {
      const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);

      const failedAnalyses = await this.analysisHistoryModel.find({
        status: AnalysisStatus.FAILED,
        createdAt: { $gte: cutoffTime }
      }).sort({ createdAt: -1 });

      // Group errors by platform
      const errorsByPlatform: { [platform: string]: { [error: string]: number } } = {};

      failedAnalyses.forEach(analysis => {
        const platform = analysis.platform || 'unknown';
        const error = analysis.errorCode || analysis.errorMessage || 'UNKNOWN_ERROR';

        if (!errorsByPlatform[platform]) {
          errorsByPlatform[platform] = {};
        }

        errorsByPlatform[platform][error] = (errorsByPlatform[platform][error] || 0) + 1;
      });

      // Create error trends (hourly buckets)
      const errorTrends: { timestamp: Date; errorCount: number }[] = [];
      const hourlyBuckets: { [key: string]: number } = {};

      failedAnalyses.forEach(analysis => {
        const hour = new Date(analysis.startedAt);
        hour.setMinutes(0, 0, 0);
        const key = hour.toISOString();
        hourlyBuckets[key] = (hourlyBuckets[key] || 0) + 1;
      });

      Object.entries(hourlyBuckets).forEach(([timestamp, count]) => {
        errorTrends.push({ timestamp: new Date(timestamp), errorCount: count });
      });

      // Find common error patterns
      const allErrors = failedAnalyses.map(a => a.errorMessage || '').filter(Boolean);
      const commonErrorPatterns = this.findCommonPatterns(allErrors);

      return {
        errorsByPlatform,
        errorTrends: errorTrends.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime()),
        commonErrorPatterns
      };

    } catch (error) {
      this.logger.error(`Error generating error analysis: ${error.message}`);
      return {
        errorsByPlatform: {},
        errorTrends: [],
        commonErrorPatterns: []
      };
    }
  }

  /**
   * Find common patterns in error messages
   */
  private findCommonPatterns(errors: string[]): string[] {
    const patterns: { [key: string]: number } = {};

    errors.forEach(error => {
      // Extract common patterns
      const commonWords = error.toLowerCase()
        .split(/\s+/)
        .filter(word => word.length > 3)
        .filter(word => !['error', 'failed', 'unable', 'cannot', 'could'].includes(word));

      commonWords.forEach(word => {
        patterns[word] = (patterns[word] || 0) + 1;
      });
    });

    return Object.entries(patterns)
      .filter(([, count]) => count > 2) // Must appear at least 3 times
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([pattern]) => pattern);
  }

  /**
   * Get performance insights
   */
  async getPerformanceInsights(): Promise<{
    recommendations: string[];
    optimization_opportunities: string[];
    health_score: number;
  }> {
    const metrics = await this.getHealthMetrics();
    const recommendations: string[] = [];
    const optimizationOpportunities: string[] = [];

    // Analyze metrics and provide recommendations
    if (metrics.successRate < 75) {
      recommendations.push('Improve error handling and fallback mechanisms');
      recommendations.push('Review and update web scraping selectors');
    }

    if (metrics.avgProcessingTime > 30000) {
      optimizationOpportunities.push('Optimize browser launch and page loading times');
      optimizationOpportunities.push('Implement parallel processing for multiple analyses');
      optimizationOpportunities.push('Add caching layer for frequently accessed profiles');
    }

    // Check for specific error patterns
    const topErrors = Object.entries(metrics.failureReasons)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3);

    if (topErrors.some(([error]) => error.includes('SELECTOR'))) {
      recommendations.push('Update DOM selectors for changed platform layouts');
      recommendations.push('Implement more robust element detection strategies');
    }

    if (topErrors.some(([error]) => error.includes('TIMEOUT'))) {
      optimizationOpportunities.push('Increase timeout values for slower connections');
      optimizationOpportunities.push('Implement progressive loading strategies');
    }

    if (topErrors.some(([error]) => error.includes('RATE_LIMIT'))) {
      recommendations.push('Implement exponential backoff for rate limiting');
      recommendations.push('Add delay randomization to avoid detection');
    }

    // Calculate health score (0-100)
    let healthScore = 100;

    if (metrics.successRate < 50) healthScore -= 40;
    else if (metrics.successRate < 75) healthScore -= 20;
    else if (metrics.successRate < 90) healthScore -= 10;

    if (metrics.avgProcessingTime > 60000) healthScore -= 20;
    else if (metrics.avgProcessingTime > 30000) healthScore -= 10;

    const totalErrors = Object.values(metrics.failureReasons).reduce((sum, count) => sum + count, 0);
    if (totalErrors > 20) healthScore -= 15;
    else if (totalErrors > 10) healthScore -= 10;
    else if (totalErrors > 5) healthScore -= 5;

    return {
      recommendations,
      optimization_opportunities: optimizationOpportunities,
      health_score: Math.max(0, healthScore)
    };
  }

  /**
   * Test system connectivity and basic functionality
   */
  async runHealthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    checks: { [component: string]: { status: boolean; message: string; responseTime?: number } };
    overall_score: number;
  }> {
    const checks: { [component: string]: { status: boolean; message: string; responseTime?: number } } = {};

    // Database connectivity check
    try {
      const start = Date.now();
      await this.analysisHistoryModel.countDocuments().limit(1);
      checks.database = {
        status: true,
        message: 'Database connection successful',
        responseTime: Date.now() - start
      };
    } catch (error) {
      checks.database = {
        status: false,
        message: `Database connection failed: ${error.message}`
      };
    }

    // Memory usage check
    const memoryUsage = process.memoryUsage();
    const memoryUsagePercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;
    checks.memory = {
      status: memoryUsagePercent < 90,
      message: `Memory usage: ${memoryUsagePercent.toFixed(1)}%`
    };

    // Recent analysis success rate check
    try {
      const recentCount = await this.analysisHistoryModel.countDocuments({
        createdAt: { $gte: new Date(Date.now() - 60 * 60 * 1000) } // Last hour
      });

      const recentSuccessCount = await this.analysisHistoryModel.countDocuments({
        createdAt: { $gte: new Date(Date.now() - 60 * 60 * 1000) },
        status: AnalysisStatus.COMPLETED
      });

      const recentSuccessRate = recentCount > 0 ? (recentSuccessCount / recentCount) * 100 : 100;

      checks.recent_success_rate = {
        status: recentSuccessRate > 50,
        message: `Recent success rate: ${recentSuccessRate.toFixed(1)}% (${recentSuccessCount}/${recentCount})`
      };
    } catch (error) {
      checks.recent_success_rate = {
        status: false,
        message: `Could not check recent success rate: ${error.message}`
      };
    }

    // Stuck analyses check
    try {
      const stuckCount = await this.analysisHistoryModel.countDocuments({
        status: { $in: [AnalysisStatus.PENDING, AnalysisStatus.IN_PROGRESS] },
        createdAt: { $lt: new Date(Date.now() - 30 * 60 * 1000) }
      });

      checks.stuck_analyses = {
        status: stuckCount === 0,
        message: stuckCount > 0 ? `${stuckCount} stuck analyses detected` : 'No stuck analyses'
      };
    } catch (error) {
      checks.stuck_analyses = {
        status: false,
        message: `Could not check stuck analyses: ${error.message}`
      };
    }

    // Calculate overall status
    const passedChecks = Object.values(checks).filter(check => check.status).length;
    const totalChecks = Object.keys(checks).length;
    const overallScore = (passedChecks / totalChecks) * 100;

    let status: 'healthy' | 'degraded' | 'unhealthy';
    if (overallScore >= 80) status = 'healthy';
    else if (overallScore >= 60) status = 'degraded';
    else status = 'unhealthy';

    return {
      status,
      checks,
      overall_score: overallScore
    };
  }

  /**
   * Generate daily health report
   */
  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async generateDailyHealthReport(): Promise<void> {
    try {
      this.logger.log('=== DAILY PROFILE SCOUT HEALTH REPORT ===');

      const metrics = await this.getHealthMetrics();
      const healthCheck = await this.runHealthCheck();
      const errorAnalysis = await this.getErrorAnalysis(24);
      const insights = await this.getPerformanceInsights();

      this.logger.log(`Overall Health Score: ${healthCheck.overall_score.toFixed(1)}%`);
      this.logger.log(`System Status: ${healthCheck.status.toUpperCase()}`);
      this.logger.log(`Success Rate (24h): ${metrics.successRate.toFixed(1)}%`);
      this.logger.log(`Total Analyses (24h): ${metrics.totalAnalyses}`);
      this.logger.log(`Avg Processing Time: ${(metrics.avgProcessingTime / 1000).toFixed(1)}s`);

      // Platform breakdown
      this.logger.log('\n--- Platform Performance ---');
      Object.entries(metrics.platformSuccessRates).forEach(([platform, rate]) => {
        this.logger.log(`${platform.toUpperCase()}: ${rate.toFixed(1)}% success rate`);
      });

      // Top errors
      if (Object.keys(metrics.failureReasons).length > 0) {
        this.logger.log('\n--- Top Failure Reasons ---');
        Object.entries(metrics.failureReasons)
          .sort(([,a], [,b]) => b - a)
          .slice(0, 5)
          .forEach(([error, count]) => {
            this.logger.log(`${error}: ${count} occurrences`);
          });
      }

      // Recommendations
      if (insights.recommendations.length > 0) {
        this.logger.log('\n--- Recommendations ---');
        insights.recommendations.forEach(rec => {
          this.logger.log(`• ${rec}`);
        });
      }

      // Health check details
      this.logger.log('\n--- Component Health ---');
      Object.entries(healthCheck.checks).forEach(([component, check]) => {
        const status = check.status ? '✅' : '❌';
        this.logger.log(`${status} ${component}: ${check.message}`);
      });

      this.logger.log('=== END DAILY REPORT ===\n');

    } catch (error) {
      this.logger.error(`Error generating daily health report: ${error.message}`);
    }
  }
}
