import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { AuthService } from "./auth.service";

@Injectable()
export class YouTubeTokenRefreshService {
  private readonly logger = new Logger(YouTubeTokenRefreshService.name);

  constructor(private readonly authService: AuthService) {}

  @Cron(CronExpression.EVERY_30_MINUTES)
  async handleYouTubeTokenRefresh() {
    this.logger.log("Starting YouTube token refresh job");
    await this.authService.autoRefreshExpiringYouTubeTokens();
    this.logger.log("YouTube token refresh job completed");
  }
}
