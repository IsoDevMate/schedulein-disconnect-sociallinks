import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { YouTubeAnalyticsService } from './youtube-analytics.service';
import { YouTubeAnalyticsController } from './youtube-analytics.controller';
import { YouTubeController } from './youtube.controller';
import { YouTubeService } from './youtube.service';
import { VideoAnalytics, VideoAnalyticsSchema } from './schemas/video-analytics.schema';
import { CompetitorAnalysis, CompetitorAnalysisSchema } from './schemas/competitor-analysis.schema';
import { HashtagAnalytics, HashtagAnalyticsSchema } from './schemas/hashtag-analytics.schema';
import { NicheAnalytics, NicheAnalyticsSchema } from './schemas/niche-analytics.schema';

// Import required modules
import { UsersModule } from '../users/users.module';
import { AuthModule } from '../auth/auth.module';
import { PaymentsModule } from '../payments/payments.module';
import { MonitoringModule } from '../monitoring/monitoring.module';
import { YouTubeDataWorker } from './workers/youtube-data.worker';

// Import existing services
import { AnalyticsService } from './services/analytics.service';
import { OutlierDetectionService } from './services/outlier-detection.service';
import { ContentIdeaService } from './services/content-idea.service';
import { CrossNicheComparisonService } from './services/cross-niche-comparison.service';
import { PostingTimeService } from './services/posting-time.service';
import { UserLocationService } from './services/user-location.service';
import { TrendDetectionService } from './services/trend-detection.service';
import { CacheService } from './services/cache.service';
import { YouTubeChannelResolverService } from './services/youtube-channel-resolver.service';
import { YouTubeQuotaMonitorService } from './services/youtube-quota-monitor.service';

// Import OpenAI module
import { OpenAIModule } from '../openai/openai.module';

// Import new enhanced services
import { EnhancedNicheClassificationService } from './services/enhanced-niche-classification.service';
import { EnhancedContentAnalysisService } from './services/enhanced-content-analysis.service';
import { EnhancedAnalyticsController } from './controllers/enhanced-analytics.controller';
import { OutlierDetectionController } from './controllers/outlier-detection.controller';
import { RisingStarsController } from "./controllers/rising-stars.controller";

@Module({
  imports: [
    ConfigModule,
    ScheduleModule.forRoot(),
    forwardRef(() => UsersModule),
    forwardRef(() => AuthModule),
    forwardRef(() => PaymentsModule),
    forwardRef(() => MonitoringModule),
    OpenAIModule, // Add OpenAI module
    MongooseModule.forFeature([
      { name: VideoAnalytics.name, schema: VideoAnalyticsSchema },
      { name: CompetitorAnalysis.name, schema: CompetitorAnalysisSchema },
      { name: HashtagAnalytics.name, schema: HashtagAnalyticsSchema },
      { name: NicheAnalytics.name, schema: NicheAnalyticsSchema },
    ]),
  ],
  controllers: [
    YouTubeController,
    RisingStarsController,
    YouTubeAnalyticsController,
    EnhancedAnalyticsController, // Add new controller
    OutlierDetectionController, // Add outlier detection controller
  ],
  providers: [
    YouTubeService,
    YouTubeAnalyticsService,
    AnalyticsService,
    OutlierDetectionService,
    ContentIdeaService,
    CrossNicheComparisonService,
    PostingTimeService,
    UserLocationService,
    TrendDetectionService,
    CacheService,
    YouTubeDataWorker,
    YouTubeChannelResolverService,
    YouTubeQuotaMonitorService, // Add quota monitor service
    EnhancedNicheClassificationService, // Add new service
    EnhancedContentAnalysisService, // Add new service
  ],
  exports: [
    YouTubeService,
    YouTubeAnalyticsService,
    AnalyticsService,
    OutlierDetectionService,
    ContentIdeaService,
    CrossNicheComparisonService,
    PostingTimeService,
    UserLocationService,
    TrendDetectionService,
    CacheService,
    YouTubeChannelResolverService,
    YouTubeQuotaMonitorService, // Export quota monitor service
    EnhancedNicheClassificationService, // Export new service
    EnhancedContentAnalysisService, // Export new service
  ],
})
export class YouTubeModule {}
