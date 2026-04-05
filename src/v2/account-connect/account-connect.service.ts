import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  Inject,
  forwardRef,
} from "@nestjs/common";
import axios from "axios";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import {
  AccountConnect,
  PlatformType,
  ConnectionStatus,
} from "./schemas/account-connect.schema";
import {
  ConnectAccountDto,
  UpdateAccountDto,
  AccountConnectResponseDto,
} from "./dto/account-connect.dto";
import { YouTubeService } from "../../youtube/youtube.service";
import { TikTokService } from "../../tiktok/tiktok.service";
// import { InstagramModule } from "../../instagram/instagram.module";
import { UsersService } from "../../users/users.service";
// import { MonitoringService } from "./monitoring.service";
import { AuthService } from "../../auth/auth.service";
import { ConfigService } from "@nestjs/config";
import { OAuthService } from "../../v2/oauth/oauth.service";

@Injectable()
export class AccountConnectService {
  private readonly logger = new Logger(AccountConnectService.name);

  constructor(
    @InjectModel(AccountConnect.name)
    private accountConnectModel: Model<AccountConnect>,
    @Inject(forwardRef(() => YouTubeService))
    private readonly youtubeService: YouTubeService,
    @Inject(forwardRef(() => TikTokService))
    private readonly tiktokService: TikTokService,
    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,
    // private readonly monitoringService: MonitoringService,
    @Inject(forwardRef(() => AuthService))
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
    private readonly oauthService: OAuthService,
  ) {}

  async connectAccount(
    userId: string,
    connectAccountDto: ConnectAccountDto,
  ): Promise<AccountConnectResponseDto> {
    try {
      this.logger.debug(
        `Connecting account for user ${userId} on platform ${connectAccountDto.platform}`,
      );

      // Check if account is already connected
      const existingAccount = await this.accountConnectModel.findOne({
        userId: new Types.ObjectId(userId),
        platform: connectAccountDto.platform,
        platformUserId: connectAccountDto.platformUserId,
      });

      if (existingAccount) {
        this.logger.warn(`Account already connected on ${connectAccountDto.platform} for user ${userId}`);

        // Instead of throwing an error, update the existing account with new data
        this.logger.debug(`Updating existing account connection with new data`);

        // Update the existing account with new platform data AND tokens
        const updatedAccount = await this.accountConnectModel.findByIdAndUpdate(
          existingAccount._id,
          {
            $set: {
              platformData: connectAccountDto.platformData,
              platformUsername: connectAccountDto.platformUsername,
              platformDisplayName: connectAccountDto.platformDisplayName,
              platformProfilePicture: connectAccountDto.platformProfilePicture,
              accessToken: connectAccountDto.accessToken,
              refreshToken: connectAccountDto.refreshToken,
              tokenExpiry: connectAccountDto.tokenExpiry ? new Date(connectAccountDto.tokenExpiry) : existingAccount.tokenExpiry,
              permissions: connectAccountDto.permissions || existingAccount.permissions,
              lastSyncedAt: new Date(),
              status: ConnectionStatus.CONNECTED,
            },
          },
          { new: true }
        );

        return {
          id: updatedAccount._id.toString(),
          platform: updatedAccount.platform,
          platformUserId: updatedAccount.platformUserId,
          platformUsername: updatedAccount.platformUsername,
          platformDisplayName: updatedAccount.platformDisplayName,
          platformProfilePicture: updatedAccount.platformProfilePicture,
          status: updatedAccount.status,
          isActive: updatedAccount.isActive,
          lastSyncAt: updatedAccount.lastSyncAt,
          createdAt: (updatedAccount as any).createdAt || new Date(),
          permissions: updatedAccount.permissions,
          tokenExpiry: updatedAccount.tokenExpiry,
          platformData: updatedAccount.platformData,
        };
      }

      this.logger.debug(`No existing account found, proceeding with connection`);

      // Validate platform-specific data
      await this.validatePlatformAccount(connectAccountDto);
      this.logger.debug(`Platform validation passed`);

      // Create new account connection
      const accountConnect = new this.accountConnectModel({
        userId: new Types.ObjectId(userId), // SAME USER ID - no new user created
        platform: connectAccountDto.platform,
        platformUserId: connectAccountDto.platformUserId,
        platformUsername: connectAccountDto.platformUsername,
        platformDisplayName: connectAccountDto.platformDisplayName,
        platformProfilePicture: connectAccountDto.platformProfilePicture,
        accessToken: connectAccountDto.accessToken,
        refreshToken: connectAccountDto.refreshToken,
        tokenExpiry: connectAccountDto.tokenExpiry
          ? new Date(connectAccountDto.tokenExpiry)
          : undefined,
        permissions: connectAccountDto.permissions || [],
        status: ConnectionStatus.CONNECTED,
        isActive: true,
        lastSyncAt: new Date(),
        // Use provided platform data if available, otherwise sync
        platformData: connectAccountDto.platformData || {},
      });

      this.logger.debug(`Saving account connection to database...`);
      const savedAccount = await accountConnect.save();
      this.logger.debug(`Account connection saved with ID: ${savedAccount._id}`);

      // Fetch initial platform data only if not provided
      if (!connectAccountDto.platformData) {
        this.logger.debug(`Starting platform data sync...`);
        await this.syncPlatformData(savedAccount._id.toString());
        this.logger.debug(`Platform data sync completed`);
      } else {
        this.logger.debug(`Using provided platform data, skipping sync`);
      }

      const response = this.mapToResponseDto(savedAccount);
      this.logger.debug(`AccountConnect response created:`, {
        id: response.id,
        platform: response.platform,
        status: response.status
      });

      return response;
    } catch (error) {
      this.logger.error(
        `Failed to connect account: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get all connected accounts for a user across all platforms
   * This shows how the same user ID can have multiple platform connections
   */
  async getAllUserConnections(userId: string): Promise<{
    userInfo: any;
    connectedAccounts: AccountConnectResponseDto[];
    totalAccounts: number;
  }> {
    try {
      // Get user info (from User collection)
      const user = await this.usersService.findById(userId);

      // Get all account connections (from AccountConnect collection)
      const connectedAccounts = await this.accountConnectModel
        .find({
          userId: new Types.ObjectId(userId),
          isActive: true,
        })
        .sort({ createdAt: -1 });

      return {
        userInfo: {
          id: user._id,
          email: user.email,
          authMethod: user.authMethod,
          name: user.name,
          // Basic social accounts for authentication
          authSocialAccounts:
            user.socialAccounts?.map((acc) => ({
              platform: acc.platform,
              accountId: acc.accountId,
              isConnected: acc.isConnected,
            })) || [],
        },
        connectedAccounts: connectedAccounts.map((account) =>
          this.mapToResponseDto(account),
        ),
        totalAccounts: connectedAccounts.length,
      };
    } catch (error) {
      this.logger.error(
        `Failed to get user connections: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async getConnectedAccounts(
    userId: string,
  ): Promise<AccountConnectResponseDto[]> {
    try {
      const accounts = await this.accountConnectModel
        .find({
          userId: new Types.ObjectId(userId),
          isActive: true,
        })
        .sort({ createdAt: -1 });

      return accounts.map((account) => this.mapToResponseDto(account));
    } catch (error) {
      this.logger.error(
        `Failed to get connected accounts: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async getAccountById(
    userId: string,
    accountId: string,
  ): Promise<AccountConnectResponseDto> {
    try {
      const account = await this.accountConnectModel.findOne({
        _id: new Types.ObjectId(accountId),
        userId: new Types.ObjectId(userId),
      });

      if (!account) {
        throw new NotFoundException("Account not found");
      }

      return this.mapToResponseDto(account);
    } catch (error) {
      this.logger.error(
        `Failed to get account by ID: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async updateAccount(
    userId: string,
    accountId: string,
    updateAccountDto: UpdateAccountDto,
  ): Promise<AccountConnectResponseDto> {
    try {
      const account = await this.accountConnectModel.findOneAndUpdate(
        {
          _id: new Types.ObjectId(accountId),
          userId: new Types.ObjectId(userId),
        },
        {
          $set: {
            ...(updateAccountDto.platformDisplayName && {
              platformDisplayName: updateAccountDto.platformDisplayName,
            }),
            ...(updateAccountDto.platformProfilePicture && {
              platformProfilePicture: updateAccountDto.platformProfilePicture,
            }),
            ...(updateAccountDto.status && { status: updateAccountDto.status }),
            ...(typeof updateAccountDto.isActive === "boolean" && {
              isActive: updateAccountDto.isActive,
            }),
          },
        },
        { new: true },
      );

      if (!account) {
        throw new NotFoundException("Account not found");
      }

      return this.mapToResponseDto(account);
    } catch (error) {
      this.logger.error(
        `Failed to update account: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async disconnectAccount(userId: string, accountId: string): Promise<void> {
    try {
      const result = await this.accountConnectModel.findOneAndUpdate(
        {
          _id: new Types.ObjectId(accountId),
          userId: new Types.ObjectId(userId),
        },
        {
          $set: {
            status: ConnectionStatus.DISCONNECTED,
            isActive: false,
            accessToken: null,
            refreshToken: null,
          },
        },
      );

      if (!result) {
        throw new NotFoundException("Account not found");
      }

      this.logger.debug(`Account ${accountId} disconnected for user ${userId}`);
    } catch (error) {
      this.logger.error(
        `Failed to disconnect account: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async syncPlatformData(accountId: string): Promise<void> {
    const startTime = Date.now();
    let account: any = null;

    try {
      account = await this.accountConnectModel.findById(accountId);
      if (!account) {
        throw new NotFoundException("Account not found");
      }

      this.logger.debug(
        `Syncing platform data for account ${accountId} on ${account.platform}`,
      );

      let platformData: any = {};

      switch (account.platform) {
        case PlatformType.YOUTUBE:
          platformData = await this.syncYouTubeData();
          break;
        case PlatformType.TIKTOK:
          platformData = await this.syncTikTokData();
          break;
        case PlatformType.INSTAGRAM:
          platformData = await this.syncInstagramData();
          break;
        default:
          throw new BadRequestException(
            `Unsupported platform: ${account.platform}`,
          );
      }

      // Update account with new platform data
      await this.accountConnectModel.findByIdAndUpdate(accountId, {
        $set: {
          platformData,
          lastSyncAt: new Date(),
        },
      });

      const syncTime = Date.now() - startTime;
      // await this.monitoringService.logSyncSuccess(accountId, account.platform, syncTime);

      this.logger.debug(
        `Platform data synced successfully for account ${accountId} in ${syncTime}ms`,
      );
    } catch (error) {
      const syncTime = Date.now() - startTime;
      // await this.monitoringService.logSyncFailure(accountId, error.message, account?.platform || 'unknown');

      this.logger.error(
        `Failed to sync platform data: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async refreshToken(accountId: string): Promise<void> {
    try {
      const account = await this.accountConnectModel.findById(accountId);
      if (!account) {
        throw new NotFoundException("Account not found");
      }

      if (!account.refreshToken) {
        throw new BadRequestException("No refresh token available");
      }

      this.logger.debug(`Refreshing token for account ${accountId} on ${account.platform}`);

      let newAccessToken: string;
      let newRefreshToken: string;
      let newTokenExpiry: Date;

      switch (account.platform) {
        case PlatformType.YOUTUBE:
          const youtubeTokens = await this.refreshYouTubeToken(account.refreshToken);
          newAccessToken = youtubeTokens.accessToken;
          newRefreshToken = youtubeTokens.refreshToken;
          newTokenExpiry = youtubeTokens.expiresIn ? new Date(youtubeTokens.expiresIn * 1000) : new Date(Date.now() + 3600 * 1000); // Default 1 hour if no expiry
          break;
        case PlatformType.TIKTOK:
          const tiktokTokens = await this.refreshTikTokToken(account.refreshToken);
          newAccessToken = tiktokTokens.accessToken;
          newRefreshToken = tiktokTokens.refreshToken;
          newTokenExpiry = new Date(Date.now() + tiktokTokens.expiresIn * 1000);
          break;
        default:
          throw new BadRequestException(
            `Token refresh not supported for platform: ${account.platform}`,
          );
      }

      // Update account with new tokens
      await this.accountConnectModel.findByIdAndUpdate(accountId, {
        $set: {
          accessToken: newAccessToken,
          refreshToken: newRefreshToken,
          tokenExpiry: newTokenExpiry,
          status: ConnectionStatus.CONNECTED,
          lastSyncAt: new Date(),
        },
      });

      this.logger.debug(`Token refreshed successfully for account ${accountId}`);
    } catch (error) {
      this.logger.error(
        `Failed to refresh token: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  // private async syncTikTokData(account: AccountConnect): Promise<any> {
  //   try {
  //     const userInfo = await this.tiktokService.getUserInfo(
  //       account.accessToken,
  //     );
  //     const videos = await this.tiktokService.getUserVideos(
  //       account.accessToken,
  //       50,
  //     );

  //     const totalViews = videos.reduce(
  //       (sum, video) => sum + (video.stats?.playCount || 0),
  //       0,
  //     );
  //     const totalLikes = videos.reduce(
  //       (sum, video) => sum + (video.stats?.diggCount || 0),
  //       0,
  //     );
  //     const totalComments = videos.reduce(
  //       (sum, video) => sum + (video.stats?.commentCount || 0),
  //       0,
  //     );

  //     const engagementRate =
  //       videos.length > 0
  //         ? ((totalLikes + totalComments) / totalViews) * 100
  //         : 0;

  //     return {
  //       followersCount: userInfo.followerCount || 0,
  //       followingCount: userInfo.followingCount || 0,
  //       totalViews,
  //       totalLikes,
  //       totalComments,
  //       engagementRate: Math.round(engagementRate * 100) / 100,
  //       postingFrequency: videos.length,
  //     };
  //   } catch (error) {
  //     this.logger.error(`Failed to sync TikTok data: ${error.message}`);
  //     throw error;
  //   }
  // }

  private async validatePlatformAccount(
    connectAccountDto: ConnectAccountDto,
  ): Promise<void> {
    try {
      // switch (connectAccountDto.platform) {
      //   case PlatformType.YOUTUBE:
      //     await this.youtubeService.validateAccessToken(
      //       connectAccountDto.accessToken,
      //     );
      //     break;
      //   case PlatformType.TIKTOK:
      //     await this.tiktokService.validateAccessToken(
      //       connectAccountDto.accessToken,
      //     );
      //     break;
      //   case PlatformType.INSTAGRAM:
      //     // Add Instagram validation when available
      //     break;
      //   default:
      //     throw new BadRequestException(
      //       `Unsupported platform: ${connectAccountDto.platform}`,
      //     );
      if (!connectAccountDto.accessToken) {
        throw new BadRequestException("accessToken is required");
      }
      if (!connectAccountDto.platform || !connectAccountDto.platformUserId) {
        throw new BadRequestException(
          "platform and platformUserId are required",
        );
      }
    } catch (error) {
      this.logger.error(`Platform validation failed: ${error.message}`);
      throw new BadRequestException(
        `Invalid ${connectAccountDto.platform} account credentials`,
      );
    }
  }

  private async syncYouTubeData(/* */): Promise<any> {
    try {
      // const channelData = await this.youtubeService.getChannelInfo(
      //   account.accessToken,
      // );
      // const videos = await this.youtubeService.getChannelVideos(
      //   account.accessToken,
      //   50,
      // );

      const channelData: any = { statistics: { subscriberCount: 0 } };
      const videos: any[] = [];

      const totalViews = videos.reduce(
        (sum, video) => sum + (video.statistics?.viewCount || 0),
        0,
      );
      const totalLikes = videos.reduce(
        (sum, video) => sum + (video.statistics?.likeCount || 0),
        0,
      );
      const totalComments = videos.reduce(
        (sum, video) => sum + (video.statistics?.commentCount || 0),
        0,
      );

      const engagementRate =
        videos.length > 0
          ? ((totalLikes + totalComments) / totalViews) * 100
          : 0;

      return {
        followersCount: channelData.statistics?.subscriberCount || 0,
        totalViews,
        totalLikes,
        totalComments,
        engagementRate: Math.round(engagementRate * 100) / 100,
        postingFrequency: videos.length,
      };
    } catch (error) {
      this.logger.error(`Failed to sync YouTube data: ${error.message}`);
      throw error;
    }
  }

  private async syncTikTokData(): Promise<any> {
    // Placeholder for TikTok sync - implement when TikTok service is available
    return {
      followersCount: 0,
      followingCount: 0,
      totalViews: 0,
      totalLikes: 0,
      totalComments: 0,
      engagementRate: 0,
      postingFrequency: 0,
    };
  }

  private async syncInstagramData(): Promise<any> {
    // Placeholder for Instagram sync - implement when Instagram service is available
    return {
      followersCount: 0,
      followingCount: 0,
      totalViews: 0,
      totalLikes: 0,
      totalComments: 0,
      engagementRate: 0,
      postingFrequency: 0,
    };
  }

  /**
   * Delete all AccountConnect documents for a user (called when user is deleted)
   */
  async deleteUserAccounts(userId: string): Promise<void> {
    try {
      const result = await this.accountConnectModel.deleteMany({
        userId: new Types.ObjectId(userId)
      });
      this.logger.debug(`Deleted ${result.deletedCount} AccountConnect documents for user ${userId}`);
    } catch (error) {
      this.logger.error(`Failed to delete AccountConnect documents for user ${userId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Sync AccountConnect documents when user identity is updated
   */
  async syncUserIdentityUpdate(userId: string, platform: PlatformType, updatedData: any): Promise<void> {
    try {
      const accounts = await this.accountConnectModel.find({
        userId: new Types.ObjectId(userId),
        platform: platform
      });

      for (const account of accounts) {
        // Update basic profile info
        const updates: any = {};

        if (updatedData.platformUsername) {
          updates.platformUsername = updatedData.platformUsername;
        }
        if (updatedData.platformDisplayName) {
          updates.platformDisplayName = updatedData.platformDisplayName;
        }
        if (updatedData.platformProfilePicture) {
          updates.platformProfilePicture = updatedData.platformProfilePicture;
        }
        if (updatedData.accessToken) {
          updates.accessToken = updatedData.accessToken;
        }
        if (updatedData.refreshToken) {
          updates.refreshToken = updatedData.refreshToken;
        }
        if (updatedData.tokenExpiry) {
          updates.tokenExpiry = new Date(updatedData.tokenExpiry);
        }

        if (Object.keys(updates).length > 0) {
          await this.accountConnectModel.findByIdAndUpdate(account._id, {
            $set: updates,
            lastSyncAt: new Date()
          });
          this.logger.debug(`Updated AccountConnect ${account._id} for user ${userId}`);
        }
      }
    } catch (error) {
      this.logger.error(`Failed to sync user identity update: ${error.message}`);
      throw error;
    }
  }

  /**
   * Refresh token for a specific account
   */
  async refreshAccountToken(accountId: string): Promise<void> {
    try {
      const account = await this.accountConnectModel.findById(accountId);
      if (!account) {
        throw new NotFoundException("Account not found");
      }

      if (!account.refreshToken) {
        throw new BadRequestException("No refresh token available");
      }

      this.logger.debug(`Refreshing token for account ${accountId} on ${account.platform}`);

      let newAccessToken: string;
      let newRefreshToken: string;
      let newTokenExpiry: Date;

      switch (account.platform) {
        case PlatformType.YOUTUBE:
          const youtubeTokens = await this.refreshYouTubeToken(account.refreshToken);
          newAccessToken = youtubeTokens.accessToken;
          newRefreshToken = youtubeTokens.refreshToken;
          newTokenExpiry = youtubeTokens.expiresIn ? new Date(youtubeTokens.expiresIn * 1000) : new Date(Date.now() + 3600 * 1000); // Default 1 hour if no expiry
          break;
        case PlatformType.TIKTOK:
          const tiktokTokens = await this.refreshTikTokToken(account.refreshToken);
          newAccessToken = tiktokTokens.accessToken;
          newRefreshToken = tiktokTokens.refreshToken;
          newTokenExpiry = new Date(Date.now() + tiktokTokens.expiresIn * 1000);
          break;
        default:
          throw new BadRequestException(
            `Token refresh not supported for platform: ${account.platform}`,
          );
      }

      // Update account with new tokens
      await this.accountConnectModel.findByIdAndUpdate(accountId, {
        $set: {
          accessToken: newAccessToken,
          refreshToken: newRefreshToken,
          tokenExpiry: newTokenExpiry,
          status: ConnectionStatus.CONNECTED,
          lastSyncAt: new Date(),
        },
      });

      this.logger.debug(`Token refreshed successfully for account ${accountId}`);
    } catch (error) {
      this.logger.error(`Failed to refresh token for account ${accountId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Background sync for all active accounts (can be called by a cron job)
   */
  async syncAllActiveAccounts(): Promise<void> {
    try {
      const activeAccounts = await this.accountConnectModel.find({
        isActive: true,
        status: ConnectionStatus.CONNECTED
      });

      this.logger.debug(`Starting background sync for ${activeAccounts.length} active accounts`);

      for (const account of activeAccounts) {
        try {
          // Check if token is expired
          if (account.tokenExpiry && new Date() > account.tokenExpiry) {
            this.logger.warn(`Token expired for account ${account._id}, marking as expired`);
            await this.accountConnectModel.findByIdAndUpdate(account._id, {
              $set: { status: ConnectionStatus.EXPIRED }
            });
            continue;
          }

          // Sync platform data
          await this.syncPlatformData(account._id.toString());
          this.logger.debug(`Synced account ${account._id} for user ${account.userId}`);
        } catch (error) {
          this.logger.error(`Failed to sync account ${account._id}: ${error.message}`);
          // Mark as needs attention but don't fail the entire batch
          await this.accountConnectModel.findByIdAndUpdate(account._id, {
            $set: { status: ConnectionStatus.ERROR }
          });
        }
      }

      this.logger.debug(`Background sync completed for ${activeAccounts.length} accounts`);
    } catch (error) {
      this.logger.error(`Background sync failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Refresh YouTube token using refresh token
   */
  private async refreshYouTubeToken(refreshToken: string): Promise<any> {
    try {
      // Use the OAuth service's existing YouTube token refresh method
      const response = await this.oauthService.refreshYouTubeToken(refreshToken);

      return {
        accessToken: response.accessToken,
        refreshToken: response.refreshToken || refreshToken,
        expiresIn: response.expiresIn || 3600,
      };
    } catch (error) {
      this.logger.error(`Failed to refresh YouTube token: ${error.message}`);
      throw new BadRequestException('Failed to refresh YouTube token');
    }
  }

  /**
   * Refresh TikTok token using refresh token
   */
  private async refreshTikTokToken(refreshToken: string): Promise<any> {
    try {
      // Use the OAuth service's existing TikTok token refresh method
      const response = await this.oauthService.refreshTikTokToken(refreshToken);

      return {
        accessToken: response.accessToken,
        refreshToken: response.refreshToken || refreshToken,
        expiresIn: response.expiresIn || 3600,
      };
    } catch (error) {
      this.logger.error(`Failed to refresh TikTok token: ${error.message}`);
      throw new BadRequestException('Failed to refresh TikTok token');
    }
  }

  private mapToResponseDto(account: any): AccountConnectResponseDto {
    return {
      id: account._id?.toString() || account.id?.toString() || 'unknown',
      platform: account.platform,
      platformUserId: account.platformUserId || 'unknown',
      platformUsername: account.platformUsername,
      platformDisplayName: account.platformDisplayName,
      platformProfilePicture: account.platformProfilePicture,
      status: account.status,
      isActive: account.isActive,
      lastSyncAt: account.lastSyncAt,
      createdAt: account.createdAt || new Date(),
      permissions: account.permissions || [],
      tokenExpiry: account.tokenExpiry,
    };
  }
}
