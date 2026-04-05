import mongoose from "mongoose";
import { bootstrap, getDatabaseConfig } from "./bootstrap";

// Define a more complete interface that matches the User schema
interface MigrationUser extends mongoose.Document {
  _id: mongoose.Types.ObjectId;
  email?: string;
  password?: string;
  role?: string;
  isEmailVerified?: boolean;
  confirmationToken?: string;
  resetToken?: string;
  resetTokenExpires?: Date;
  lastLoginAt?: Date;
  lastLoginIp?: string;
  lastTokenRefreshAt?: Date;
  authMethod?: string;
  authMethods?: string[];

  // LinkedIn properties
  linkedInId?: string;
  linkedInAccessToken?: string;
  organizationUrn?: string;
  linkedInCompanyPages?: any[];
  linkedInData?: any;

  // TikTok properties
  TiktokId?: string;
  TiktokAccessToken?: string;
  TiktokRefreshToken?: string;
  TiktokAccessTokenExpiry?: string;
  tiktokData?: any;

  // YouTube properties
  youtubeAccessToken?: string;
  youtubeRefreshToken?: string;
  youtubeAccessTokenExpiry?: number;
  youtubeId?: string;
  youtubeProfile?: any;

  // Instagram properties
  instagramId?: string;
  instagramAccessToken?: string;
  instagramAccessTokenExpiry?: number;
  instagramRefreshToken?: string;
  instagramData?: {
    username: string;
    profilePicture: string;
    mediaCount: number;
    followersCount: number;
    followingCount: number;
  };

  // Common properties
  name?: string;
  avatar?: string;
  socialAccounts?: any[];
  createdAt?: Date;
  updatedAt?: Date;
  [key: string]: any;
}

async function migrate() {
  try {
    await bootstrap();
    const dbConfig = getDatabaseConfig();

    // Connect to MongoDB using ConfigService
    await mongoose.connect(dbConfig.uri, dbConfig.options);
    console.log("Connected to MongoDB");

    // Create a schema that's compatible with MigrationUser
    const MigrationUserSchema = new mongoose.Schema(
      {
        email: String,
        password: String,
        role: String,
        isEmailVerified: Boolean,
        confirmationToken: String,
        resetToken: String,
        resetTokenExpires: Date,
        lastLoginAt: Date,
        lastLoginIp: String,
        lastTokenRefreshAt: Date,
        authMethod: String,
        authMethods: [String],

        // LinkedIn properties
        linkedInId: String,
        linkedInAccessToken: String,
        organizationUrn: String,
        linkedInCompanyPages: [Object],
        linkedInData: Object,

        // TikTok properties
        TiktokId: String,
        TiktokAccessToken: String,
        TiktokRefreshToken: String,
        TiktokAccessTokenExpiry: String,
        tiktokData: Object,

        // YouTube properties
        youtubeAccessToken: String,
        youtubeRefreshToken: String,
        youtubeAccessTokenExpiry: Number,
        youtubeId: String,
        youtubeProfile: Object,

        // Instagram properties
        instagramId: String,
        instagramAccessToken: String,
        instagramAccessTokenExpiry: Number,
        instagramRefreshToken: String,
        instagramData: Object,

        // Common properties
        name: String,
        avatar: String,
        socialAccounts: [
          {
            platform: {
              type: String,
              required: true,
              enum: ["instagram", "tiktok", "youtube", "linkedin", "facebook"],
            },
            accountId: { type: String, required: true },
            accessToken: { type: String, required: true },
            refreshToken: { type: String },
            expiresAt: { type: Number },
            profile: {
              username: { type: String },
              displayName: { type: String },
              email: { type: String },
              profilePicture: { type: String },
            },
            data: { type: mongoose.Schema.Types.Mixed },
            isConnected: { type: Boolean, default: true },
            lastSyncedAt: { type: Date },
            createdAt: { type: Date, default: Date.now },
            updatedAt: { type: Date, default: Date.now },
          },
        ],
      },
      { timestamps: true },
    );

    // Get all users with proper typing
    const UserModel = mongoose.model<MigrationUser>(
      "User",
      MigrationUserSchema,
    );
    const users = (await UserModel.find({})
      .lean()
      .exec()) as unknown as MigrationUser[];
    console.log(`Found ${users.length} users to migrate`);

    let migratedCount = 0;

    for (const user of users) {
      if (!user) continue;

      const updates: any = { $set: {} };
      const socialAccounts = Array.isArray(user.socialAccounts)
        ? [...user.socialAccounts]
        : [];
      let needsUpdate = false;

      // Skip if already migrated and no legacy fields exist
      const hasLegacyFields =
        user.instagramId || user.TiktokId || user.linkedInId || user.youtubeId;

      if (!hasLegacyFields) {
        continue;
      }

      // Migrate Instagram data if exists
      if (user.instagramId && user.instagramAccessToken) {
        const existingInstagramAccount = socialAccounts.some(
          (acc: any) =>
            acc.platform === "instagram" && acc.accountId === user.instagramId,
        );

        if (!existingInstagramAccount) {
          const instagramProfile = user.instagramData || {};
          const instagramAccount = {
            platform: "instagram",
            accountId: user.instagramId,
            accessToken: user.instagramAccessToken,
            refreshToken: user.instagramRefreshToken,
            expiresAt: user.instagramAccessTokenExpiry,
            profile: {
              username: (instagramProfile as any).username,
              displayName:
                (instagramProfile as any).displayName ||
                (instagramProfile as any).username ||
                "Instagram User",
              email: (instagramProfile as any).email || user.email,
              profilePicture: (instagramProfile as any).profilePicture,
              ...instagramProfile,
            },
            data: instagramProfile,
            isConnected: true,
            lastSyncedAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
          };

          socialAccounts.push(instagramAccount);
          needsUpdate = true;
        }
      }

      // Migrate TikTok data if exists
      if (user.TiktokId && user.TiktokAccessToken) {
        const existingTikTokAccount = socialAccounts.some(
          (acc: any) =>
            acc.platform === "tiktok" && acc.accountId === user.TiktokId,
        );

        if (!existingTikTokAccount) {
          const tiktokProfile = user.tiktokData || {};
          const tiktokAccount = {
            platform: "tiktok",
            accountId: user.TiktokId,
            accessToken: user.TiktokAccessToken,
            refreshToken: user.TiktokRefreshToken,
            expiresAt: user.TiktokAccessTokenExpiry,
            profile: {
              username: (tiktokProfile as any).username,
              displayName:
                (tiktokProfile as any).displayName ||
                (tiktokProfile as any).username ||
                "TikTok User",
              email: (tiktokProfile as any).email || user.email,
              profilePicture: (tiktokProfile as any).profilePicture,
              ...tiktokProfile,
            },
            data: tiktokProfile,
            isConnected: true,
            lastSyncedAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
          };

          socialAccounts.push(tiktokAccount);
          needsUpdate = true;
        }
      }

      // Migrate LinkedIn data if exists
      if (user.linkedInId && user.linkedInAccessToken) {
        const existingLinkedInAccount = socialAccounts.some(
          (acc: any) =>
            acc.platform === "linkedin" && acc.accountId === user.linkedInId,
        );

        if (!existingLinkedInAccount) {
          const linkedinProfile = user.linkedInData || {};
          const linkedinAccount = {
            platform: "linkedin",
            accountId: user.linkedInId,
            accessToken: user.linkedInAccessToken,
            profile: {
              username: (linkedinProfile as any).username,
              displayName:
                (linkedinProfile as any).displayName ||
                (linkedinProfile as any).username ||
                "LinkedIn User",
              email: (linkedinProfile as any).email || user.email,
              profilePicture: (linkedinProfile as any).profilePicture,
              ...linkedinProfile,
            },
            data: linkedinProfile,
            isConnected: true,
            lastSyncedAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
          };

          socialAccounts.push(linkedinAccount);
          needsUpdate = true;
        }
      }

      // Migrate YouTube data if exists
      if (user.youtubeId && user.youtubeAccessToken) {
        const existingYouTubeAccount = socialAccounts.some(
          (acc: any) =>
            acc.platform === "youtube" && acc.accountId === user.youtubeId,
        );

        if (!existingYouTubeAccount) {
          const youtubeProfile = user.youtubeProfile || {};
          const youtubeAccount = {
            platform: "youtube",
            accountId: user.youtubeId,
            accessToken: user.youtubeAccessToken,
            refreshToken: user.youtubeRefreshToken,
            expiresAt: user.youtubeAccessTokenExpiry,
            profile: {
              username: (youtubeProfile as any).username,
              displayName:
                (youtubeProfile as any).displayName ||
                (youtubeProfile as any).username ||
                "YouTube User",
              email: (youtubeProfile as any).email || user.email,
              profilePicture: (youtubeProfile as any).profilePicture,
              ...youtubeProfile,
            },
            data: youtubeProfile,
            isConnected: true,
            lastSyncedAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
          };

          socialAccounts.push(youtubeAccount);
          needsUpdate = true;
        }
      }

      if (needsUpdate) {
        // Validate that all social accounts have required fields
        const validSocialAccounts = socialAccounts.filter((account: any) => {
          if (!account.platform || !account.accountId || !account.accessToken) {
            console.warn(
              `Skipping invalid social account for user ${user.email || user._id}:`,
              account,
            );
            return false;
          }
          return true;
        });

        updates.$set.socialAccounts = validSocialAccounts;

        try {
          await UserModel.findByIdAndUpdate(user._id, updates);
          migratedCount++;
          console.log(`Migrated user: ${user.email || user._id}`);
        } catch (error) {
          console.error(`Error migrating user ${user._id}:`, error);
        }
      }
    }

    console.log(`Migration complete. Updated ${migratedCount} users.`);

    // Handle email conflicts after migration
    await handleEmailConflicts();

    process.exit(0);
  } catch (error) {
    console.error("Migration error:", error);
    process.exit(1);
  }
}

// Handle email conflicts for users with the same email across auth methods
async function handleEmailConflicts() {
  // Create a schema that's compatible with MigrationUser
  const MigrationUserSchema = new mongoose.Schema(
    {
      email: String,
      password: String,
      role: String,
      isEmailVerified: Boolean,
      confirmationToken: String,
      resetToken: String,
      resetTokenExpires: Date,
      lastLoginAt: Date,
      lastLoginIp: String,
      lastTokenRefreshAt: Date,
      authMethod: String,
      authMethods: [String],

      // LinkedIn properties
      linkedInId: String,
      linkedInAccessToken: String,
      organizationUrn: String,
      linkedInCompanyPages: [Object],
      linkedInData: Object,

      // TikTok properties
      TiktokId: String,
      TiktokAccessToken: String,
      TiktokRefreshToken: String,
      TiktokAccessTokenExpiry: String,
      tiktokData: Object,

      // YouTube properties
      youtubeAccessToken: String,
      youtubeRefreshToken: String,
      youtubeAccessTokenExpiry: Number,
      youtubeId: String,
      youtubeProfile: Object,

      // Instagram properties
      instagramId: String,
      instagramAccessToken: String,
      instagramAccessTokenExpiry: Number,
      instagramRefreshToken: String,
      instagramData: Object,

      // Common properties
      name: String,
      avatar: String,
      socialAccounts: [
        {
          platform: {
            type: String,
            required: true,
            enum: ["instagram", "tiktok", "youtube", "linkedin", "facebook"],
          },
          accountId: { type: String, required: true },
          accessToken: { type: String, required: true },
          refreshToken: { type: String },
          expiresAt: { type: Number },
          profile: {
            username: { type: String },
            displayName: { type: String },
            email: { type: String },
            profilePicture: { type: String },
          },
          data: { type: mongoose.Schema.Types.Mixed },
          isConnected: { type: Boolean, default: true },
          lastSyncedAt: { type: Date },
          createdAt: { type: Date, default: Date.now },
          updatedAt: { type: Date, default: Date.now },
        },
      ],
    },
    { timestamps: true },
  );

  const UserModel = mongoose.model<MigrationUser>("User", MigrationUserSchema);

  try {
    console.log("Checking for email conflicts...");

    // Find users with duplicate emails
    const duplicateEmails = await UserModel.aggregate([
      { $match: { email: { $exists: true, $ne: null } } },
      { $group: { _id: { $toLower: "$email" }, count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
    ]);

    if (duplicateEmails.length === 0) {
      console.log("No email conflicts found.");
      return;
    }

    console.log(
      `Found ${duplicateEmails.length} email(s) with multiple accounts.`,
    );
    let mergedCount = 0;

    for (const { _id: email } of duplicateEmails) {
      const users = await UserModel.find({
        email: { $regex: new RegExp(`^${email}$`, "i") },
      });
      if (users.length <= 1) continue;

      // Sort users by creation date (oldest first)
      users.sort(
        (a, b) => (a.createdAt?.getTime() || 0) - (b.createdAt?.getTime() || 0),
      );

      // Keep the first user and merge others into it
      const primaryUser = users[0];
      const usersToMerge = users.slice(1);

      for (const userToMerge of usersToMerge) {
        // Merge social accounts, avoiding duplicates
        const existingAccountIds = new Set(
          (primaryUser.socialAccounts || []).map(
            (acc: any) => `${acc.platform}:${acc.accountId}`,
          ),
        );

        const newSocialAccounts = (userToMerge.socialAccounts || []).filter(
          (acc: any) =>
            !existingAccountIds.has(`${acc.platform}:${acc.accountId}`),
        );

        if (newSocialAccounts.length > 0) {
          await UserModel.findByIdAndUpdate(primaryUser._id, {
            $addToSet: {
              socialAccounts: { $each: newSocialAccounts },
              authMethods: { $each: userToMerge.authMethods || [] },
            },
          });
        }

        // Delete the merged user
        await UserModel.findByIdAndDelete(userToMerge._id);
        console.log(`Merged user ${userToMerge._id} into ${primaryUser._id}`);
        mergedCount++;
      }
    }

    console.log(`Resolved ${mergedCount} duplicate accounts.`);
  } catch (error) {
    console.error("Error handling email conflicts:", error);
  }
}

migrate();
