// getrewardful.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class GetRewardfulService {
  private readonly logger = new Logger(GetRewardfulService.name);
  private apiKey: string;
  private baseUrl: string;

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>('GETREWARDFUL_API_KEY');
    this.baseUrl = 'https://api.getrewardful.com/v1';
  }

  async createAffiliate(email: string, name: string) {
    try {
      const response = await axios.post(
        `${this.baseUrl}/affiliates`,
        { email, name },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
        },
      );
      return response.data;
    } catch (error) {
      this.logger.error('Error creating affiliate:', error.message);
      throw new Error('Failed to create affiliate');
    }
  }

  async getAffiliateLink(affiliateId: string) {
    try {
      const response = await axios.get(
        `${this.baseUrl}/affiliates/${affiliateId}/link`,
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
          },
        },
      );
      return response.data.link;
    } catch (error) {
      this.logger.error('Error getting affiliate link:', error.message);
      throw new Error('Failed to get affiliate link');
    }
  }
}
