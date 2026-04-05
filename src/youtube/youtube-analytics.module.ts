import { Module, forwardRef } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { MongooseModule } from "@nestjs/mongoose";
import { ScheduleModule } from "@nestjs/schedule";
import { MonitoringModule } from "../monitoring/monitoring.module";
import { systemConfig } from "../config/system.config";
import { YouTubeAnalyticsController } from "./youtube-analytics.controller";
import { YouTubeAnalyticsService } from "./youtube-analytics.service";
import { AuthModule } from "../auth/auth.module";
import { AnalyticsController } from "./controllers/analytics.controller";
import { AnalyticsService } from "./services/analytics.service";
import { BaseAnalyticsService } from "./services/base-analytics.service";
import { TrendDetectionService } from "./services/trend-detection.service";
import { PostingTimeService } from "./services/posting-time.service";
import { ContentIdeaService } from "./services/content-idea.service";
import { CrossNicheComparisonService } from "./services/cross-niche-comparison.service";
import { EnhancedNicheClassificationService } from "./services/enhanced-niche-classification.service";
import { YouTubeQuotaMonitorService } from "./services/youtube-quota-monitor.service";
import { OpenAIModule } from "../openai/openai.module";
import {
  VideoAnalytics,
  VideoAnalyticsSchema,
} from "./schemas/video-analytics.schema";
import {
  HashtagAnalytics,
  HashtagAnalyticsSchema,
} from "./schemas/hashtag-analytics.schema";
import {
  NicheAnalytics,
  NicheAnalyticsSchema,
} from "./schemas/niche-analytics.schema";
import { UsersModule } from "../users/users.module";

@Module({
  imports: [
    ConfigModule.forFeature(systemConfig),
    AuthModule,
    ScheduleModule.forRoot(),
    MonitoringModule,
    OpenAIModule,
    forwardRef(() => UsersModule),
    MongooseModule.forFeature([
      { name: VideoAnalytics.name, schema: VideoAnalyticsSchema },
      { name: HashtagAnalytics.name, schema: HashtagAnalyticsSchema },
      { name: NicheAnalytics.name, schema: NicheAnalyticsSchema },
    ]),
  ],
  controllers: [YouTubeAnalyticsController, AnalyticsController],
  providers: [
    YouTubeAnalyticsService,
    {
      provide: BaseAnalyticsService,
      useClass: AnalyticsService,
    },
    AnalyticsService,
    TrendDetectionService,
    PostingTimeService,
    ContentIdeaService,
    CrossNicheComparisonService,
    EnhancedNicheClassificationService,
    YouTubeQuotaMonitorService,
  ],
  exports: [
    YouTubeAnalyticsService,
    AnalyticsService,
    TrendDetectionService,
    PostingTimeService,
    ContentIdeaService,
    CrossNicheComparisonService,
    EnhancedNicheClassificationService,
    YouTubeQuotaMonitorService,
  ],
})
export class YouTubeAnalyticsModule {}
