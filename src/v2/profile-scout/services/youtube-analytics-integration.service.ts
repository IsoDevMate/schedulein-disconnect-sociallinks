import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

export interface YouTubeAnalyticsData {
  demographics: {
    ageGroups: Array<{
      ageGroup: string;
      percentage: number;
      count: number;
    }>;
    genders: Array<{
      gender: string;
      percentage: number;
      count: number;
    }>;
  };
  geographics: Array<{
    country: string;
    countryCode: string;
    percentage: number;
    count: number;
  }>;
  lastUpdated: Date;
  dataSource: 'youtube_analytics' | 'estimated';
  confidence: number;
}

@Injectable()
export class YouTubeAnalyticsIntegrationService {
  private readonly logger = new Logger(YouTubeAnalyticsIntegrationService.name);
  private readonly apiKey: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.apiKey = this.configService.get<string>('YOUTUBE_API_KEY');
  }

  /**
   * Get real audience demographics from YouTube Analytics API (requires OAuth)
   */
  async getRealAudienceDemographics(
    userId: string,
    channelId: string,
  ): Promise<YouTubeAnalyticsData | null> {
    try {
      this.logger.log(`Attempting to get real YouTube Analytics data for channel: ${channelId}`);

      // Check if we have OAuth access
      const hasAccess = await this.hasAnalyticsAccess(userId);
      if (!hasAccess) {
        this.logger.warn(`No YouTube Analytics access for user: ${userId}`);
        return null;
      }

      // Get OAuth token (this would be implemented with proper OAuth flow)
      const accessToken = await this.getUserAccessToken(userId);
      if (!accessToken) {
        this.logger.warn(`No access token available for user: ${userId}`);
        return null;
      }

      // Use YouTube Analytics API v2 to get real demographics
      const analyticsData = await this.fetchYouTubeAnalyticsData(accessToken, channelId);

      if (analyticsData) {
        this.logger.log(`Successfully retrieved real YouTube Analytics data for channel: ${channelId}`);
        return analyticsData;
      }

      return null;
    } catch (error) {
      this.logger.warn(`Failed to get real YouTube Analytics data: ${error.message}`);
      return null;
    }
  }

  /**
   * Get user's OAuth access token (placeholder for OAuth implementation)
   */
  private async getUserAccessToken(userId: string): Promise<string | null> {
    // This would retrieve the stored OAuth token for the user
    // For now, return null to indicate no OAuth token available
    this.logger.warn(`OAuth token retrieval not implemented for user: ${userId}`);
    return null;
  }

  /**
   * Fetch real YouTube Analytics data using the Analytics API v2
   */
  private async fetchYouTubeAnalyticsData(accessToken: string, channelId: string): Promise<YouTubeAnalyticsData | null> {
    try {
      // YouTube Analytics API v2 endpoints
      const baseUrl = 'https://youtubeanalytics.googleapis.com/v2/reports';

      // Get audience demographics (age groups, gender, geography)
      const [demographicsResponse, geographicsResponse] = await Promise.all([
        this.makeAnalyticsRequest(`${baseUrl}`, {
          ids: `channel==${channelId}`,
          startDate: '2023-01-01',
          endDate: new Date().toISOString().split('T')[0],
          metrics: 'viewerPercentage',
          dimensions: 'ageGroup,gender',
          sort: '-viewerPercentage'
        }, accessToken),

        this.makeAnalyticsRequest(`${baseUrl}`, {
          ids: `channel==${channelId}`,
          startDate: '2023-01-01',
          endDate: new Date().toISOString().split('T')[0],
          metrics: 'viewerPercentage',
          dimensions: 'country',
          sort: '-viewerPercentage',
          maxResults: 25
        }, accessToken)
      ]);

      if (!demographicsResponse || !geographicsResponse) {
        return null;
      }

      // Parse demographics data
      const ageGroups = demographicsResponse.rows
        ?.filter(row => row[0] && row[0] !== 'ageUnknown') // Filter out unknown age groups
        .map(row => ({
          ageGroup: row[0],
          percentage: parseFloat(row[2]) || 0,
          count: Math.floor((parseFloat(row[2]) || 0) * 1000000 / 100) // Estimate count
        })) || [];

      const genders = demographicsResponse.rows
        ?.filter(row => row[1] && row[1] !== 'genderUnknown') // Filter out unknown gender
        .map(row => ({
          gender: row[1],
          percentage: parseFloat(row[2]) || 0,
          count: Math.floor((parseFloat(row[2]) || 0) * 1000000 / 100) // Estimate count
        })) || [];

      // Parse geographics data
      const geographics = geographicsResponse.rows?.map(row => ({
        country: this.getCountryNameFromCode(row[0]),
        countryCode: row[0],
        percentage: parseFloat(row[1]) || 0,
        count: Math.floor((parseFloat(row[1]) || 0) * 1000000 / 100) // Estimate count
      })) || [];

      return {
        demographics: {
          ageGroups,
          genders
        },
        geographics,
        lastUpdated: new Date(),
        dataSource: 'youtube_analytics',
        confidence: 95 // High confidence for real API data
      };

    } catch (error) {
      this.logger.error(`Failed to fetch YouTube Analytics data: ${error.message}`);
      return null;
    }
  }

  /**
   * Make authenticated request to YouTube Analytics API
   */
  private async makeAnalyticsRequest(url: string, params: any, accessToken: string): Promise<any> {
    try {
      const response = await this.httpService.get(url, {
        params,
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      }).toPromise();

      return response.data;
    } catch (error) {
      this.logger.error(`YouTube Analytics API request failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Get country name from country code
   */
  private getCountryNameFromCode(countryCode: string): string {
    const countryNames: { [key: string]: string } = {
      'US': 'United States',
      'IN': 'India',
      'BR': 'Brazil',
      'JP': 'Japan',
      'GB': 'United Kingdom',
      'MX': 'Mexico',
      'DE': 'Germany',
      'KR': 'South Korea',
      'FR': 'France',
      'CA': 'Canada',
      'ID': 'Indonesia',
      'IT': 'Italy',
      'ES': 'Spain',
      'AU': 'Australia',
      'NL': 'Netherlands',
      'RU': 'Russia',
      'TR': 'Turkey',
      'AR': 'Argentina',
      'TH': 'Thailand',
      'VN': 'Vietnam',
      'PH': 'Philippines',
      'MY': 'Malaysia',
      'PL': 'Poland',
      'SE': 'Sweden',
      'NO': 'Norway',
      'KE': 'Kenya',
      'NG': 'Nigeria',
      'ZA': 'South Africa',
      'EG': 'Egypt',
      'MA': 'Morocco'
    };

    return countryNames[countryCode] || countryCode;
  }

  /**
   * Get public channel data that doesn't require OAuth
   */
  async getPublicChannelData(channelId: string): Promise<any> {
    try {
      this.logger.log(`Getting public YouTube data for channel: ${channelId}`);

      const response = await firstValueFrom(
        this.httpService.get('https://www.googleapis.com/youtube/v3/channels', {
          params: {
            key: this.apiKey,
            part: 'snippet,statistics,contentDetails',
            id: channelId,
          },
        }),
      );

      if (response.data.items && response.data.items.length > 0) {
        return response.data.items[0];
      }

      throw new Error('Channel not found');
    } catch (error) {
      this.logger.warn(`Failed to get public YouTube data for ${channelId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Check if real analytics data is available for a user
   */
  async hasAnalyticsAccess(userId: string): Promise<boolean> {
    // This would check if the user has granted YouTube Analytics permissions
    // For now, return false as we don't have OAuth implementation
    return false;
  }

  /**
   * Get estimated demographics based on channel characteristics
   */
  async getEstimatedDemographics(channelData: any): Promise<YouTubeAnalyticsData> {
    const subscriberCount = parseInt(channelData.statistics?.subscriberCount || '1000000');
    const viewCount = parseInt(channelData.statistics?.viewCount || '10000000');
    const videoCount = parseInt(channelData.statistics?.videoCount || '100');

    // Estimate audience size (typically 2-5x subscriber count)
    const estimatedAudience = Math.max(subscriberCount * 3, 1000000);

    // Generate realistic age group distribution
    const ageGroups = [
      { ageGroup: 'age13-17', basePercentage: 8 },
      { ageGroup: 'age18-24', basePercentage: 25 },
      { ageGroup: 'age25-34', basePercentage: 30 },
      { ageGroup: 'age35-44', basePercentage: 20 },
      { ageGroup: 'age45-54', basePercentage: 12 },
      { ageGroup: 'age55-64', basePercentage: 4 },
      { ageGroup: 'age65+', basePercentage: 1 },
    ].map(group => ({
      ageGroup: group.ageGroup,
      percentage: group.basePercentage,
      count: Math.floor((group.basePercentage / 100) * estimatedAudience),
    }));

    // Generate realistic gender distribution
    const genders = [
      { gender: 'male', basePercentage: 55 },
      { gender: 'female', basePercentage: 42 },
      { gender: 'user_specified', basePercentage: 3 },
    ].map(gender => ({
      gender: gender.gender,
      percentage: gender.basePercentage,
      count: Math.floor((gender.basePercentage / 100) * estimatedAudience),
    }));

    // Generate realistic geographic distribution
    const countryData = [
      { country: 'United States', countryCode: 'US', basePercentage: 16.4 },
      { country: 'India', countryCode: 'IN', basePercentage: 9.1 },
      { country: 'Brazil', countryCode: 'BR', basePercentage: 8.6 },
      { country: 'Japan', countryCode: 'JP', basePercentage: 4.9 },
      { country: 'United Kingdom', countryCode: 'GB', basePercentage: 4.1 },
      { country: 'Mexico', countryCode: 'MX', basePercentage: 3.8 },
      { country: 'Germany', countryCode: 'DE', basePercentage: 3.6 },
      { country: 'South Korea', countryCode: 'KR', basePercentage: 3.2 },
      { country: 'France', countryCode: 'FR', basePercentage: 2.9 },
      { country: 'Canada', countryCode: 'CA', basePercentage: 2.7 },
      { country: 'Indonesia', countryCode: 'ID', basePercentage: 2.5 },
      { country: 'Italy', countryCode: 'IT', basePercentage: 2.3 },
      { country: 'Spain', countryCode: 'ES', basePercentage: 2.1 },
      { country: 'Australia', countryCode: 'AU', basePercentage: 1.9 },
      { country: 'Netherlands', countryCode: 'NL', basePercentage: 1.7 },
      { country: 'Russia', countryCode: 'RU', basePercentage: 1.5 },
      { country: 'Turkey', countryCode: 'TR', basePercentage: 1.3 },
      { country: 'Argentina', countryCode: 'AR', basePercentage: 1.1 },
      { country: 'Thailand', countryCode: 'TH', basePercentage: 1.0 },
      { country: 'Vietnam', countryCode: 'VN', basePercentage: 0.9 },
      { country: 'Philippines', countryCode: 'PH', basePercentage: 0.8 },
      { country: 'Malaysia', countryCode: 'MY', basePercentage: 0.7 },
      { country: 'Poland', countryCode: 'PL', basePercentage: 0.6 },
      { country: 'Sweden', countryCode: 'SE', basePercentage: 0.5 },
      { country: 'Norway', countryCode: 'NO', basePercentage: 0.4 },
    ].map(country => ({
      country: country.country,
      countryCode: country.countryCode,
      percentage: country.basePercentage,
      count: Math.floor((country.basePercentage / 100) * estimatedAudience),
    }));

    return {
      demographics: {
        ageGroups,
        genders,
      },
      geographics: countryData,
      lastUpdated: new Date(),
      dataSource: 'estimated',
      confidence: 60, // Medium confidence for estimated data
    };
  }
}
