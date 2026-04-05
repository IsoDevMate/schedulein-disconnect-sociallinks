import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { Post } from "./entities/post.entity";
import { NotificationService } from "../notificattions/notificattions.service";
import { PostsService } from "./posts.service";
import { UsersService } from "../users/users.service";
// import { TimeUtils } from 'src/common/utils/time.utils';

@Injectable()
export class PostScheduler {
  private readonly logger = new Logger(PostScheduler.name);

  constructor(
    @InjectModel(Post.name) private readonly postModel: Model<Post>,
    private readonly userService: UsersService,
    private readonly postsService: PostsService,
    private readonly notificationService: NotificationService,
  ) {}

  @Cron(CronExpression.EVERY_12_HOURS, { timeZone: "Africa/Nairobi" })
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

      const posts = await this.postModel.find({
        scheduledTime: nowInNairobi,
        status: "pending",
      });

      this.logger.log(
        `Found ${posts.length} posts scheduled for exact time: ${nowInNairobi.toISOString()}`,
      );

      for (const post of posts) {
        try {
          //   const scheduledTime = new Date(post.scheduledTime);
          //   if (!TimeUtils.isWithinPublishWindow(scheduledTime)) {
          //     continue;
          //   }
          this.logger.log(
            `Processing post with ID: ${post._id} scheduled for ${post.scheduledTime}`,
          );

          this.logger.log(`Publishing post with ID: ${post._id}`);
          await this.postsService.publishPost(post);

          post.status = "published";
          post.publishedAt = new Date();
          await post.save();

          this.logger.log(`Successfully published post with ID: ${post._id}`);
        } catch (error) {
          this.logger.error(
            `Error publishing post with ID: ${post._id}`,
            error,
          );

          // Update post status with error
          post.status = "failed";
          post.lastError = error.message;
          await post.save();

          // // Send failure notification
          // try {
          //   await this.notificationService.sendNotification(
          //     post.userId,
          //     'Post Failed',
          //     `Failed to publish post: ${error.message}`
          //   );
          // } catch (notifError) {
          //   this.logger.error(`Failed to send failure notification for post ${post._id}: ${notifError.message}`);
          // }

          // Implement retry logic here if needed
          // For example, you could set a retryCount and reschedule if below threshold
        }
      }
    } catch (error) {
      this.logger.error("Error in cron job:", error);
      // Consider implementing system-wide error notification here
    }

    this.logger.log("Cron job completed: handleCron");
  }

  async findUserById(
    userId: string,
  ): Promise<{ linkedInAccessToken: string } | null> {
    const user = await this.userService.findById(userId);
    if (!user) {
      return null;
    }
    return { linkedInAccessToken: user.linkedInAccessToken };
  }
}
