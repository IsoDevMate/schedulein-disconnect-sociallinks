import { Module, forwardRef } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { ScheduleModule } from "@nestjs/schedule";
import { PassportModule } from "@nestjs/passport";
import { AccountConnectController } from "./account-connect.controller";
import { AdvancedAIController } from "./advanced-ai.controller";
import { AccountConnectService } from "./account-connect.service";
import { AnalyticsService } from "./analytics.service";
import { GoalsService } from "./goals.service";
import { BookmarksService } from "./bookmarks.service";
import { CollectionsService } from "./collections.service";
import { ContentSummaryService } from "./content-summary.service";
import { AIRecommendationService } from "./services/ai-recommendation.service";
import { AdvancedAIAnalysisService } from "./services/advanced-ai-analysis.service";
import { EnhancedOpenAIService } from "../../openai/enhanced-openai.service";

import { CronSyncService } from "./cron-sync.service";
// import { MonitoringService } from "./monitoring.service";
import {
  AccountConnect,
  AccountConnectSchema,
} from "./schemas/account-connect.schema";
import { UserGoal, UserGoalSchema } from "./schemas/user-goal.schema";
import { Bookmark, BookmarkSchema } from "./schemas/bookmark.schema";
import { Collection, CollectionSchema } from "./schemas/collection.schema";

import {
  AnalyticsData,
  AnalyticsDataSchema,
} from "./schemas/analytics-data.schema";
import { YouTubeModule } from "../../youtube/youtube.module";
import { TikTokModule } from "../../tiktok/tiktok.module";
import { InstagramModule } from "../../instagram/instagram.module";
import { OpenAIModule } from "../../openai/openai.module";
import  { UsersModule } from "../../users/users.module";
import { AuthModule } from "../../auth/auth.module";
import { OAuthModule } from "../../v2/oauth/oauth.module";
import { V2CreditsModule } from "../credits/v2-credits.module";
import { V2JwtAuthGuard } from "./guards/v2-jwt-auth.guard";
import { V2JwtStrategy } from "./guards/v2-jwt.strategy";
@Module({
  imports: [
    ScheduleModule.forRoot(),
    PassportModule,
    MongooseModule.forFeature([
      { name: AccountConnect.name, schema: AccountConnectSchema },
      { name: UserGoal.name, schema: UserGoalSchema },
      { name: Bookmark.name, schema: BookmarkSchema },
      { name: Collection.name, schema: CollectionSchema },
      { name: AnalyticsData.name, schema: AnalyticsDataSchema },
    ]),
    forwardRef(() => YouTubeModule),
    TikTokModule,
    InstagramModule,
    OpenAIModule,
    forwardRef(() => UsersModule),
    AuthModule,
    OAuthModule,
    forwardRef(() => V2CreditsModule),
  ],
  controllers: [AccountConnectController, AdvancedAIController],
  providers: [
    AccountConnectService,
    AnalyticsService,
    GoalsService,
    BookmarksService,
    CollectionsService,
    ContentSummaryService,
    AIRecommendationService,
    AdvancedAIAnalysisService,
    EnhancedOpenAIService,
    CronSyncService,
    V2JwtStrategy,
    V2JwtAuthGuard,
    // MonitoringService,
  ],
  exports: [
    AccountConnectService,
    AnalyticsService,
    GoalsService,
    BookmarksService,
    CollectionsService,
    ContentSummaryService,
    // MonitoringService,
  ],

})
export class AccountConnectModule {}
