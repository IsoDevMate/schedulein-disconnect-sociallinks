import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { CacheModule } from '@nestjs/cache-manager';
import { ProfileScoutController } from './profile-scout.controller';
import { ProfileScoutService } from './profile-scout.service';
import { ReportGeneratorService } from './services/report-generator.service';
import { YouTubeProfileService } from './services/youtube-profile.service';
import { TikTokProfileService } from './services/tiktok-profile.service';
import { KeywordAnalyzerService } from './services/keyword-analyzer.service';
import { AnalysisHistoryService } from './services/analysis-history.service';
import { ProfileScoutMonitoringService } from './services/monitoring.service';
import { AudienceDemographicsService } from './services/audience-demographics.service';
import { DynamicCountryDataService } from './services/dynamic-country-data.service';
import { YouTubeAnalyticsIntegrationService } from './services/youtube-analytics-integration.service';
import { SmartDemographicsService } from './services/smart-demographics.service';
import { MultiProviderApiService } from './services/multi-provider-api.service';
import { CommentDemographicsService } from './services/comment-demographics.service';
import { TikTokCommentScraperService } from './services/tiktok-comment-scraper.service';
import { TikTokCommentScraperController } from './tiktok-comment-scraper.controller';
import { CacheService } from './cache/cache.service';
import { AnalysisHistory, AnalysisHistorySchema } from './schemas/analysis-history.schema';
import { YouTubeModule } from '../../youtube/youtube.module';
import { OpenAIModule } from '../../openai/openai.module';
import { V2JwtAuthGuard } from '../account-connect/guards/v2-jwt-auth.guard';
import { V2JwtStrategy } from '../account-connect/guards/v2-jwt.strategy';
import { V2CreditsModule } from '../credits/v2-credits.module';
import demographicsConfig from './config/demographics.config';

@Module({
  imports: [
    ConfigModule.forFeature(demographicsConfig),
    PassportModule,
    HttpModule,
    CacheModule.register({
      ttl: 60 * 60 * 1000, // 1 hour
      max: 1000, // Maximum number of items in cache
    }),
    MongooseModule.forFeature([
      { name: AnalysisHistory.name, schema: AnalysisHistorySchema },
    ]),
    YouTubeModule,
    OpenAIModule,
    forwardRef(() => V2CreditsModule),
  ],
  controllers: [ProfileScoutController, TikTokCommentScraperController],
  providers: [
    ProfileScoutService,
    ReportGeneratorService,
    YouTubeProfileService,
    TikTokProfileService,
    KeywordAnalyzerService,
    AnalysisHistoryService,
    ProfileScoutMonitoringService,
    AudienceDemographicsService,
    DynamicCountryDataService,
    YouTubeAnalyticsIntegrationService,
    SmartDemographicsService,
    MultiProviderApiService,
    CommentDemographicsService,
    TikTokCommentScraperService,
    CacheService,
    V2JwtStrategy,
    V2JwtAuthGuard,
  ],
  exports: [
    ProfileScoutService,
    YouTubeProfileService,
    TikTokProfileService,
    AnalysisHistoryService,
    AudienceDemographicsService,
    DynamicCountryDataService,
    YouTubeAnalyticsIntegrationService,
    SmartDemographicsService,
    MultiProviderApiService,
    CommentDemographicsService,
    TikTokCommentScraperService,
    CacheService,
  ],
})
export class ProfileScoutModule {}
