import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { TikTokPost, TikTokPostStatus } from "./entities/tiktok-post.entity";
import { TikTokService } from "./tiktok.service";
import { UsersService } from "../users/users.service";
import { S3Service } from "../s3/s3.service";

@Injectable()
export class TikTokScheduler {
  private readonly logger = new Logger(TikTokScheduler.name);

  constructor(
    @InjectModel(TikTokPost.name)
    private readonly tiktokPostModel: Model<TikTokPost>,
    private readonly tiktokService: TikTokService,
    private readonly usersService: UsersService,
    private readonly s3Service: S3Service,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async handleCron() {
    this.logger.log("Cron job started: handleCron");

    try {
      const now = new Date();
      const timeZoneOffset = -now.getTimezoneOffset() * 60000;
      const nowInNairobi = new Date(now.getTime() + timeZoneOffset);

      nowInNairobi.setSeconds(0);
      nowInNairobi.setMilliseconds(0);

      this.logger.log(
        `Current time (Africa/Nairobi): ${nowInNairobi.toISOString()}`,
      );

      const posts = await this.tiktokPostModel.find({
        scheduledTime: nowInNairobi,
        status: TikTokPostStatus.PENDING,
      });

      this.logger.log(
        `Found ${posts.length} posts scheduled for exact time: ${nowInNairobi.toISOString()}`,
      );

      for (const post of posts) {
        try {
          this.logger.log(
            `Processing post with ID: ${post._id} scheduled for ${post.scheduledTime}`,
          );

          const user = await this.usersService.findById(post.userId);
          if (!user || !user.TiktokAccessToken) {
            throw new Error("User not found or TikTok access token missing");
          }

          post.status = TikTokPostStatus.PROCESSING;
          await post.save();

          // If there's a media file, download it from S3
          let mediaBuffer: Buffer | undefined;
          if (post.mediaUrl) {
            const filename = post.mediaUrl.split("/").pop();
            mediaBuffer = await this.s3Service.downloadMedia(
              post.userId,
              "media",
              filename,
            );
          }

          // Create post DTO
          const createPostDto = {
            source: mediaBuffer ? "FILE_UPLOAD" : "PULL_FROM_URL",
            caption: post.content,
            privacyLevel: post.privacyLevel || "PUBLIC",
            disableComment: post.disableComment,
            disableDuet: post.disableDuet,
            disableStitch: post.disableStitch,
            videoUrl: !mediaBuffer ? post.mediaUrl : undefined,
          };

          // Initialize upload
          const initResult = await this.tiktokService.upload(
            createPostDto,
            user.TiktokAccessToken,
          );

          if (mediaBuffer && initResult.upload_url) {
            // Upload the video
            await this.tiktokService.uploadVideoBuffer(
              initResult.upload_url,
              mediaBuffer,
              "video/mp4",
            );
          }

          // Store publish ID for status checking
          post.publishId = initResult.publish_id;
          post.status = TikTokPostStatus.PUBLISHED;
          post.publishedAt = new Date();
          await post.save();

          this.logger.log(`Successfully published post with ID: ${post._id}`);
        } catch (error) {
          this.logger.error(
            `Error publishing post with ID: ${post._id}`,
            error,
          );

          // Update post status with error
          post.status = TikTokPostStatus.FAILED;
          post.lastError = error.message;
          await post.save();
        }
      }
    } catch (error) {
      this.logger.error("Error in cron job:", error);
    }

    this.logger.log("Cron job completed: handleCron");
  }
}
