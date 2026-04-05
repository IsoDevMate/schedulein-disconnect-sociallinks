import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AffiliateService } from './affiliate.service';
import { GetRewardfulService } from '../getrewardful/getrewardful.service';

@Module({
  imports: [ConfigModule],
  providers: [AffiliateService, GetRewardfulService],
  exports: [AffiliateService],
})
export class AffiliateModule {}
