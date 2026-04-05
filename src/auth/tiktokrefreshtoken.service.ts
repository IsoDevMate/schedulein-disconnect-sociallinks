import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { AuthService } from "./auth.service";
import { UsersService } from "../users/users.service";

@Injectable()
export class TokenRefreshService {
  private readonly logger = new Logger(TokenRefreshService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly authService: AuthService,
  ) {}

  @Cron(CronExpression.EVERY_30_MINUTES)
  async handleTikTokTokenRefresh() {
    try {
      this.logger.log("Starting TikTok token refresh job");
      const expiryThreshold = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours from now

      const users =
        await this.usersService.findUsersWithExpiringTikTokTokens(
          expiryThreshold,
        );

      if (!users || users.length === 0) {
        this.logger.log("No TikTok tokens need refreshing at this time");
        return;
      }

      this.logger.log(
        `Found ${users.length} users with expiring TikTok tokens`,
      );

      for (const user of users) {
        try {
          this.logger.log(
            `Refreshing tokens for user ${user.email} (${user._id})`,
          );

          if (!user.TiktokRefreshToken) {
            this.logger.warn(`No refresh token found for user ${user.email}`);
            continue;
          }

          const newTokens = await this.authService.refreshTikTokAccessToken(
            user.TiktokRefreshToken,
          );

          if (!newTokens || !newTokens.access_token) {
            this.logger.error(`Invalid token response for user ${user.email}`);
            continue;
          }

          await this.usersService.update(user._id as string, {
            TiktokAccessToken: newTokens.access_token,
            TiktokRefreshToken: newTokens.refresh_token,
            TiktokAccessTokenExpiry: new Date(
              Date.now() + newTokens.expires_in * 1000,
            ).toISOString(),
            TiktokRefreshTokenExpiry: new Date(
              Date.now() + newTokens.refresh_expires_in * 1000,
            ).toISOString(),
            lastTokenRefreshAt: new Date(),
          });

          this.logger.log(
            `Successfully refreshed tokens for user ${user.email}`,
          );
        } catch (error) {
          this.logger.error(
            `Failed to refresh tokens for user ${user.email}: ${error.message}`,
            error.stack,
          );
        }
      }
    } catch (error) {
      this.logger.error(
        `Error in TikTok token refresh job: ${error.message}`,
        error.stack,
      );
    }
  }
}
