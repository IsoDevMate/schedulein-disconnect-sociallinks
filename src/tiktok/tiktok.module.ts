import { Module, forwardRef } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { TikTokController } from "./tiktok.controller";
import { TikTokService } from "./tiktok.service";
import { TikTokPost, TikTokPostSchema } from "./entities/tiktok-post.entity";
import { UsersModule } from "../users/users.module";
import { S3Module } from "../s3/s3.module";
import { TikTokScheduler } from "./tiktok.scheduler";
import { ScheduleModule } from "@nestjs/schedule";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: TikTokPost.name, schema: TikTokPostSchema },
    ]),
    forwardRef(() => UsersModule),
    S3Module,
    ScheduleModule.forRoot(),
  ],
  controllers: [TikTokController],
  providers: [TikTokService, TikTokScheduler],
  exports: [TikTokService],
})
export class TikTokModule {}
