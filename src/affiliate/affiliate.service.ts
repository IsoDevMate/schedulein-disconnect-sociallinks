
import { Injectable } from '@nestjs/common';
import { GetRewardfulService } from '../getrewardful/getrewardful.service';

@Injectable()
export class AffiliateService {
  constructor(
    private getRewardfulService: GetRewardfulService
  ) {}

  async createAffiliate(email: string, name: string) {
    return this.getRewardfulService.createAffiliate(email, name);
  }

  async getAffiliateLink(affiliateId: string) {
    return this.getRewardfulService.getAffiliateLink(affiliateId);
  }

  async rewardAffiliate(affiliateId: string, amount: number) {
    // Implement reward logic here
    
  }
}
