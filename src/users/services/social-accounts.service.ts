import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { User } from "../../users/entities/user.entity";

type SocialPlatform =
  | "instagram"
  | "tiktok"
  | "youtube"
  | "linkedin"
  | "facebook";

interface SocialAccountInput {
  platform: SocialPlatform;
  accountId: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  isConnected?: boolean;
  lastSyncedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
  profile?: {
    username?: string;
    displayName?: string;
    email?: string;
    profilePicture?: string;
    [key: string]: any;
  };
  data?: any;
}

@Injectable()
export class SocialAccountsService {
  constructor(@InjectModel("User") private readonly userModel: Model<User>) {}

  async addSocialAccount(userId: string, accountData: SocialAccountInput) {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException("User not found");
    }

    // Initialize socialAccounts array if it doesn't exist
    if (!user.socialAccounts) {
      user.socialAccounts = [];
    }

    // Check if account already exists
    const existingAccountIndex = user.socialAccounts.findIndex(
      (acc) =>
        acc.platform === accountData.platform &&
        acc.accountId === accountData.accountId,
    );

    const now = new Date();
    const account = {
      ...accountData,
      isConnected: true,
      lastSyncedAt: now,
      createdAt: now,
      updatedAt: now,
    };

    if (existingAccountIndex >= 0) {
      // Update existing account
      user.socialAccounts[existingAccountIndex] = {
        ...user.socialAccounts[existingAccountIndex],
        ...accountData,
        updatedAt: now,
      };
    } else {
      // Add new account
      user.socialAccounts.push(account);
    }

    await user.save();
    return user.socialAccounts;
  }

  async removeSocialAccount(
    userId: string,
    platform: SocialPlatform,
    accountId: string,
  ) {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException("User not found");
    }

    if (!user.socialAccounts) {
      return [];
    }

    user.socialAccounts = user.socialAccounts.filter(
      (acc) => !(acc.platform === platform && acc.accountId === accountId),
    );

    await user.save();
    return user.socialAccounts;
  }

  async getSocialAccounts(userId: string, platform?: SocialPlatform) {
    const user = await this.userModel.findById(userId).select("socialAccounts");
    if (!user) {
      throw new NotFoundException("User not found");
    }

    if (!user.socialAccounts) {
      return [];
    }

    if (platform) {
      return user.socialAccounts.filter((acc) => acc.platform === platform);
    }

    return user.socialAccounts;
  }

  async getSocialAccount(
    userId: string,
    platform: SocialPlatform,
    accountId: string,
  ) {
    const accounts = await this.getSocialAccounts(userId, platform);
    return accounts.find((acc) => acc.accountId === accountId);
  }

  async updateSocialAccount(
    userId: string,
    platform: SocialPlatform,
    accountId: string,
    updateData: Partial<SocialAccountInput>,
  ) {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException("User not found");
    }

    if (!user.socialAccounts) {
      throw new NotFoundException("No social accounts found");
    }

    const accountIndex = user.socialAccounts.findIndex(
      (acc) => acc.platform === platform && acc.accountId === accountId,
    );

    if (accountIndex === -1) {
      throw new NotFoundException("Social account not found");
    }

    // Ensure required fields are preserved
    const existingAccount = user.socialAccounts[accountIndex];

    // Log the update operation for debugging
    console.log("Updating social account:", {
      userId,
      platform,
      accountId,
      existingAccount: {
        platform: existingAccount.platform,
        accountId: existingAccount.accountId,
        isConnected: existingAccount.isConnected,
      },
      updateData,
    });

    const updatedAccount = {
      ...existingAccount,
      ...updateData,
      // Ensure required fields are not overwritten
      platform: existingAccount.platform,
      accountId: existingAccount.accountId,
      accessToken: updateData.accessToken || existingAccount.accessToken,
      updatedAt: new Date(),
      lastSyncedAt: new Date(),
    };

    // Validate the updated account before saving
    if (
      !updatedAccount.platform ||
      !updatedAccount.accountId ||
      !updatedAccount.accessToken
    ) {
      console.error("Invalid social account data after update:", {
        platform: updatedAccount.platform,
        accountId: updatedAccount.accountId,
        hasAccessToken: !!updatedAccount.accessToken,
      });
      throw new Error(
        "Social account validation failed: missing required fields",
      );
    }

    user.socialAccounts[accountIndex] = updatedAccount;

    try {
      await user.save();
      console.log("Social account updated successfully");
      return user.socialAccounts[accountIndex];
    } catch (saveError) {
      console.error("Failed to save social account update:", saveError);
      throw saveError;
    }
  }

  async disconnectSocialAccount(
    userId: string,
    platform: SocialPlatform,
    accountId: string,
  ) {
    return this.updateSocialAccount(userId, platform, accountId, {
      isConnected: false,
    });
  }

  async reconnectSocialAccount(
    userId: string,
    platform: SocialPlatform,
    accountId: string,
  ) {
    return this.updateSocialAccount(userId, platform, accountId, {
      isConnected: true,
      lastSyncedAt: new Date(),
    });
  }
}
