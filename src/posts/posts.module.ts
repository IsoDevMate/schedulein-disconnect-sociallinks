import { Module } from "@nestjs/common";
import { PostsService } from "./posts.service";
import { PostsController } from "./posts.controller";
import { MongooseModule } from "@nestjs/mongoose";
import { Post, PostSchema } from "./entities/post.entity";
import { UsersModule } from "../users/users.module";
import { LinkedinModule } from "../linkedin/linkedin.module";
import { NotificationModule } from "../notificattions/notificattions.module";
import { OpenAIService } from "../openai/openai.service";
import { S3Module } from "../s3/s3.module";
import { ScheduleModule } from "@nestjs/schedule";
import { PostScheduler } from "./posts.scheduler";
// import { SubscriptionsModule } from "src/subscriptions/subscriptions.module";
import { CarouselService } from "src/carousel/carousel.service";
@Module({
  imports: [
    ScheduleModule.forRoot(),
    MongooseModule.forFeature([{ name: Post.name, schema: PostSchema }]),
    UsersModule,
    LinkedinModule,
    NotificationModule,
    S3Module,
  ],
  controllers: [PostsController],
  providers: [PostsService, OpenAIService, PostScheduler, CarouselService],
  exports: [PostsService],
})
export class PostsModule {}
