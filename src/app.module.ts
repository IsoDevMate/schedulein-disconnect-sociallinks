import { Module } from "@nestjs/common";
import { UsersModule } from "./users/users.module";
import { MongooseModule } from "@nestjs/mongoose";
import { AuthModule } from "./auth/auth.module";
import Config from "./config/keys";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { PostsModule } from "./posts/posts.module";
import { NotificationModule } from "./notificattions/notificattions.module";
import { LinkedinModule } from "./linkedin/linkedin.module";
import { OpenAIService } from "./openai/openai.service";
import { S3Service } from "./s3/s3.service";
import { S3Module } from "./s3/s3.module";
import { OpenAIModule } from "./openai/openai.module";
import { ScheduleModule } from "@nestjs/schedule";
import { MulterModule } from "@nestjs/platform-express";
import { BloggersModule } from "./bloggers/bloggers.module";
import { AgencyModule } from "./agency/agency.module";
import { EmailService } from "./email/email.service";
import { AffiliateModule } from "./affiliate/affiliate.module";
import { GetRewardfulService } from "./getrewardful/getrewardful.service";
import { CarouselService } from "./carousel/carousel.service";
import { ArticleshareService } from "./articleshare/articleshare.service";
import { HealthController } from "./health/health.controller";
import { TikTokModule } from "./tiktok/tiktok.module";
import { MediaVerificationController } from "./media-verification-controlller/media-verification-controlller.controller";
import { PaymentsModule } from "./payments/payments.module";
import { YouTubeModule } from "./youtube/youtube.module";
import { UGCModule } from "./ugc/ugc.module";
import { ServeStaticModule } from "@nestjs/serve-static";
import { join } from "path";
import { InstagramModule } from "./instagram/instagram.module";
import { YouTubeAnalyticsModule } from "./youtube/youtube-analytics.module";
import { AccountConnectModule } from "./v2/account-connect/account-connect.module";
import { V2Module } from "./v2/v2.module";
@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, "..", "public"),
    }),
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ".env",
      load: [
        () => ({
          SENDGRID_API_KEY: process.env.SENDGRID_API_KEY,
          EMAIL_FROM: process.env.EMAIL_FROM || "oumabarack1047@gmail.com",
          APP_NAME: process.env.APP_NAME || "GROREELS",
        }),
      ],
    }),
    MulterModule.register({
      dest: "./uploads",
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        uri: configService.get("MONGO_URI") || Config.mongoURI,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        connectTimeoutMS: 10000,
        maxPoolSize: 10,
        minPoolSize: 5,
        retryWrites: true,
        retryReads: true,
        w: "majority",
        wtimeoutMS: 2500,
        heartbeatFrequencyMS: 10000,
        autoIndex: true,
        maxIdleTimeMS: 60000,
        family: 4,
      }),
      inject: [ConfigService],
    }),
    UsersModule,
    AuthModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>("JWT_SECRET"),
        signOptions: { expiresIn: "1d" },
      }),
      inject: [ConfigService],
    }),

    PostsModule,
    NotificationModule,
    LinkedinModule,
    S3Module,
    OpenAIModule,
    BloggersModule,
    AgencyModule,
    AffiliateModule,
    TikTokModule,
    PaymentsModule,
    YouTubeModule,
    UGCModule,
    InstagramModule,
    YouTubeAnalyticsModule,
    AccountConnectModule,
    V2Module,
  ],
  providers: [
    S3Service,
    OpenAIService,
    EmailService,
    GetRewardfulService,
    CarouselService,
    ArticleshareService,
  ],
  controllers: [HealthController, MediaVerificationController],
})
export class AppModule {}
