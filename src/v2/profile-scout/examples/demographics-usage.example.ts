/**
 * Example usage of the new Audience Demographics Service
 * This file demonstrates how to use the production-ready demographics system
 */

import { Injectable, Logger } from '@nestjs/common';
import { AudienceDemographicsService } from '../services/audience-demographics.service';

@Injectable()
export class DemographicsUsageExample {
  private readonly logger = new Logger(DemographicsUsageExample.name);

  constructor(
    private readonly demographicsService: AudienceDemographicsService,
  ) {}

  /**
   * Example: Get demographics for a YouTube channel
   */
  async getYouTubeChannelDemographics(channelId: string, userId: string) {
    try {
      this.logger.log(`Getting demographics for YouTube channel: ${channelId}`);

    const demographics = await this.demographicsService.getAudienceDemographics(
      'youtube',
      channelId
    );

      this.logger.log(`Demographics retrieved:`, {
        dataSource: demographics.dataSource,
        confidence: demographics.confidence,
        totalAudience: demographics.totalAudience,
        countriesCount: demographics.countries.length,
      });

      // Example: Filter top 5 countries
      const topCountries = demographics.countries
        .sort((a, b) => b.percentage - a.percentage)
        .slice(0, 5);

      this.logger.log('Top 5 countries:', topCountries.map(c => ({
        country: c.country,
        percentage: `${c.percentage.toFixed(1)}%`,
        count: `${(c.count / 1000000).toFixed(1)}M`,
      })));

      return demographics;
    } catch (error) {
      this.logger.error(`Failed to get YouTube demographics:`, error.message);
      throw error;
    }
  }

  /**
   * Example: Get demographics for a TikTok user
   */
  async getTikTokUserDemographics(username: string, userId: string) {
    try {
      this.logger.log(`Getting demographics for TikTok user: ${username}`);

    const demographics = await this.demographicsService.getAudienceDemographics(
      'tiktok',
      undefined,
      username
    );

      this.logger.log(`TikTok demographics retrieved:`, {
        dataSource: demographics.dataSource,
        confidence: demographics.confidence,
        totalAudience: demographics.totalAudience,
        lastUpdated: demographics.lastUpdated,
      });

      // Example: Group by region
      const regionalDistribution = demographics.countries.reduce((acc, country) => {
        const region = country.region;
        if (!acc[region]) {
          acc[region] = { percentage: 0, count: 0, countries: [] };
        }
        acc[region].percentage += country.percentage;
        acc[region].count += country.count;
        acc[region].countries.push(country.country);
        return acc;
      }, {} as Record<string, any>);

      this.logger.log('Regional distribution:', regionalDistribution);

      return demographics;
    } catch (error) {
      this.logger.error(`Failed to get TikTok demographics:`, error.message);
      throw error;
    }
  }

  /**
   * Example: Compare demographics across platforms
   */
  async comparePlatformDemographics(identifier: string, userId: string) {
    try {
      this.logger.log(`Comparing demographics across platforms for: ${identifier}`);

      const [youtubeDemographics, tiktokDemographics] = await Promise.allSettled([
        this.demographicsService.getAudienceDemographics('youtube' as const, identifier),
        this.demographicsService.getAudienceDemographics('tiktok' as const, undefined, identifier),
      ]);

      const comparison = {
        youtube: youtubeDemographics.status === 'fulfilled' ? {
          dataSource: youtubeDemographics.value.dataSource,
          confidence: youtubeDemographics.value.confidence,
          totalAudience: youtubeDemographics.value.totalAudience,
          topCountry: youtubeDemographics.value.countries[0]?.country,
        } : { error: youtubeDemographics.reason?.message },
        tiktok: tiktokDemographics.status === 'fulfilled' ? {
          dataSource: tiktokDemographics.value.dataSource,
          confidence: tiktokDemographics.value.confidence,
          totalAudience: tiktokDemographics.value.totalAudience,
          topCountry: tiktokDemographics.value.countries[0]?.country,
        } : { error: tiktokDemographics.reason?.message },
      };

      this.logger.log('Platform comparison:', comparison);
      return comparison;
    } catch (error) {
      this.logger.error(`Failed to compare platform demographics:`, error.message);
      throw error;
    }
  }

  /**
   * Example: Monitor demographics quality
   */
  async monitorDemographicsQuality() {
    try {
      this.logger.log('Monitoring demographics service quality...');

      const stats = await this.demographicsService.getDemographicsStats();

      this.logger.log('Demographics service stats:', {
        cacheEnabled: stats.cacheEnabled,
        dataSources: stats.dataSources,
        lastUpdated: stats.lastUpdated,
        config: stats.config,
      });

      // Example: Check if high-confidence data sources are enabled
      const highQualitySources = ['youtube_analytics'];
      const enabledHighQualitySources = stats.dataSources.filter(source =>
        highQualitySources.includes(source) && stats.config[`enable${source.split('_').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('')}`]
      );

      

      this.logger.log(`High-quality data sources enabled: ${enabledHighQualitySources.length}/${highQualitySources.length}`);

      return stats;
    } catch (error) {
      this.logger.error(`Failed to monitor demographics quality:`, error.message);
      throw error;
    }
  }

  /**
   * Example: Cache management
   */
  async manageCache(platform: string, identifier: string, userId: string) {
    try {
      this.logger.log(`Managing cache for ${platform}:${identifier}`);

      // Clear cache for specific entry
      await this.demographicsService.clearCache(platform, identifier, undefined, userId);
      this.logger.log(`Cache cleared for ${platform}:${identifier}`);

      // Get fresh data (will not use cache)
      const freshDemographics = await this.demographicsService.getAudienceDemographics(
        platform as 'youtube' | 'tiktok' | 'instagram',
        platform === 'youtube' ? identifier : undefined,
        platform === 'tiktok' ? identifier : undefined
      );

      this.logger.log(`Fresh demographics retrieved:`, {
        dataSource: freshDemographics.dataSource,
        confidence: freshDemographics.confidence,
        lastUpdated: freshDemographics.lastUpdated,
      });

      return freshDemographics;
    } catch (error) {
      this.logger.error(`Failed to manage cache:`, error.message);
      throw error;
    }
  }

  /**
   * Example: Handle different confidence levels
   */
  async handleConfidenceLevels(demographics: any) {
    const confidence = demographics.confidence;
    const dataSource = demographics.dataSource;

    this.logger.log(`Processing demographics with confidence: ${confidence}% from source: ${dataSource}`);

    if (confidence >= 80) {
      this.logger.log('High confidence data - suitable for detailed analysis');
      // Use for detailed analytics, reporting, decision making
      return { usage: 'detailed_analysis', reliability: 'high' };
    } else if (confidence >= 60) {
      this.logger.log('Medium confidence data - suitable for general insights');
      // Use for general insights, trends, rough estimates
      return { usage: 'general_insights', reliability: 'medium' };
    } else if (confidence >= 40) {
      this.logger.log('Low confidence data - use with caution');
      // Use for rough estimates, placeholders, fallback scenarios
      return { usage: 'rough_estimates', reliability: 'low' };
    } else {
      this.logger.warn('Very low confidence data - consider alternative sources');
      // Consider alternative data sources or manual input
      return { usage: 'fallback_only', reliability: 'very_low' };
    }
  }
}
