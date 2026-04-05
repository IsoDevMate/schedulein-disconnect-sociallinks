import { Injectable, BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { UsersService } from "../../users/users.service";
import { AuthService } from "../../auth/auth.service";
import { EmailService } from "../../email/email.service";
import { OAuthService } from "../oauth/oauth.service";
import { AnalyticsService } from "../account-connect/analytics.service";
import { AccountConnectService } from "../account-connect/account-connect.service";
import { PlatformType } from "../account-connect/schemas/account-connect.schema";
import { CreateIdentityDto, EmailRegistrationDto, IdentityPlatform } from "./dto/create-identity.dto";
import { UserIdentityResponseDto, IdentityDto } from "./dto/identity-response.dto";
import { Identity, CreateIdentityRequest, IdentityValidationResult, IdentityLinkResult } from "./interfaces";
import * as bcrypt from "bcryptjs";
import axios from "axios";


@Injectable()
export class IdentitiesService {
  constructor(
    private readonly usersService: UsersService,
    private readonly authService: AuthService,
    private readonly emailService: EmailService,
    private readonly oauthService: OAuthService,
    private readonly analyticsService: AnalyticsService,
    private readonly accountConnectService: AccountConnectService,
    private readonly configService: ConfigService
  ) {}

  /**
   * Get current user and their linked identities
   */
  async getMe(userId: string): Promise<UserIdentityResponseDto> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const identities = (user?.identities as any[]) || [];
    const activeIdentities = identities.filter(i => i.isActive);

    // Find primary identity (most recently used)
    const primaryIdentity = activeIdentities.length > 0
      ? activeIdentities.reduce((latest, current) =>
          (!latest.lastUsedAt || current.lastUsedAt > latest.lastUsedAt) ? current : latest
        ).platform
      : undefined;

    return {
      user: {
        id: user._id?.toString() || (user._id as any)?.toString?.() || user._id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
      },
      identities: activeIdentities.map((i) => ({
        platform: i.platform,
        subjectId: i.subjectId,
        username: i.username,
        displayName: i.displayName,
        profilePicture: i.profilePicture,
        linkedAt: i.linkedAt,
        isActive: i.isActive,
        lastUsedAt: i.lastUsedAt,
      })),
      totalIdentities: activeIdentities.length,
      primaryIdentity: primaryIdentity as IdentityPlatform,
    };
  }

  /**
   * Register a new user with email (email verification required)
   * Simple registration - user just provides email, displayName, and password
   */
  async registerWithEmail(emailRegistrationDto: EmailRegistrationDto): Promise<{ message: string }> {
    // Check if user already exists with this email
    const existingUser = await this.usersService.findByEmail(emailRegistrationDto.email);
    if (existingUser) {
      throw new ConflictException(`User already exists with this email`);
    }

    // Generate confirmation token (8-digit numeric code)
    const confirmationCode = this.authService.generateNumericCode(8);

    // Hash the password before storing
    const hashedPassword = await bcrypt.hash(emailRegistrationDto.password, 10);

    const newUser = await this.usersService.create({
      email: emailRegistrationDto.email,
      name: emailRegistrationDto.displayName || 'User',
      password: hashedPassword, // ✅ Use hashed password
      isEmailVerified: false, // Email verification required
      confirmationToken: confirmationCode, // Add confirmation token
      socialAccounts: undefined, // Explicitly set to undefined for v2 users
      identities: [], // ✅ Explicitly initialize identities array
    });

    // Create the email identity (for email, subjectId = email since email IS the unique identifier)
    const identityDto: CreateIdentityDto = {
      platform: IdentityPlatform.EMAIL,
      subjectId: emailRegistrationDto.email, // For email platform, email IS the subjectId
      email: emailRegistrationDto.email,
      displayName: emailRegistrationDto.displayName,
    };

    const identity = await this.createIdentity(newUser._id.toString(), identityDto);

    try {
      await this.emailService.sendConfirmationEmail(emailRegistrationDto.email, confirmationCode);
      return {
        message: "Registration successful. Please check your email for confirmation."
      };
    } catch (emailError) {
      console.error(`Failed to send confirmation email to ${emailRegistrationDto.email}:`, emailError);
      // Check if it's a SendGrid credit/authentication issue
      if (emailError.code === 401) {
        throw new BadRequestException(
          "Email service temporarily unavailable. Please try again later or contact support."
        );
      }

      throw new BadRequestException(
        "Failed to send confirmation email. Please try again."
      );
    }
  }


    /**
   * Login with email and password (v2)
   * Uses the new loginV2 method from AuthService
   */
  async loginWithEmail(email: string, password: string): Promise<{ user: any; accessToken: string; refreshToken: string; expires_in: string;}> {
    // Find user by email
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new BadRequestException('Invalid credentials');
    }

    // Check if email is verified
    if (!user.isEmailVerified) {
      throw new BadRequestException('Please verify your email before logging in');
    }

    // Verify password using bcrypt
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new BadRequestException('Invalid credentials');
    }

    // Use the v2 login method from AuthService
    const tokenPair = await this.authService.loginV2(user);

    return {
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        isEmailVerified: user.isEmailVerified,
        identities: user.identities || []
      },
      accessToken: tokenPair.accessToken,
      refreshToken: tokenPair.refreshToken,
      expires_in: tokenPair.expires_in,

    };
  }

  /**
   * Register a new user with a social identity (no auth required)
   * This is for new user registration flows
   */
  async registerWithIdentity(createIdentityDto: CreateIdentityDto): Promise<{ user: any; identity: Identity; accessToken: string; refreshToken: string; expires_in: string; isExistingUser?: boolean; isNewIdentity?: boolean }> {
    console.log(`[IdentitiesService] registerWithIdentity: Checking for existing user with ${createIdentityDto.platform} identity`);

    // Check if user already exists with this identity
    const existingUserId = await this.findUserByPlatformIdentity(createIdentityDto.platform, createIdentityDto.subjectId);
    if (existingUserId) {
      console.log(`[IdentitiesService] Existing user found with ${createIdentityDto.platform} identity, logging them in`);

      // USER EXISTS - LOG THEM IN instead of throwing error
      const existingUser = await this.usersService.findById(existingUserId);
      const tokenPair = await this.authService.loginV2(existingUser);

      return {
        user: {
          id: existingUser._id.toString(),
          email: existingUser.email,
          name: existingUser.name,
          avatar: existingUser.avatar,
        },
        identity: existingUser.identities.find(i => i.platform === createIdentityDto.platform) as Identity,
        accessToken: tokenPair.accessToken,
        refreshToken: tokenPair.refreshToken,
        expires_in: tokenPair.expires_in,
        isExistingUser: true // Flag to indicate this was a login, not registration
      };
    }

    // Check if user exists with this email (if provided)
    if (createIdentityDto.email) {
      console.log(`[IdentitiesService] Checking for existing user with email: ${createIdentityDto.email}`);
      const existingUser = await this.usersService.findByEmail(createIdentityDto.email);
      if (existingUser) {
        console.log(`[IdentitiesService] Existing user found with email, linking ${createIdentityDto.platform} identity`);

        const identity = await this.createIdentity(existingUser._id.toString(), createIdentityDto);

        await this.usersService.updateFieldsNoValidation(existingUser._id.toString(), {
          authMethod: createIdentityDto.platform
        });

        // IMPORTANT: Refresh user object to get the updated identities array and authMethod
        const updatedUser = await this.usersService.findById(existingUser._id.toString());
        console.log(`[IdentitiesService] User refreshed after linking identity, identities count: ${updatedUser.identities?.length || 0}, authMethod: ${updatedUser.authMethod}`);

        const tokenPair = await this.authService.loginV2(updatedUser);

        return {
          user: {
            id: updatedUser._id.toString(),
            email: updatedUser.email,
            name: updatedUser.name,
            avatar: updatedUser.avatar,
          },
          identity,
          accessToken: tokenPair.accessToken,
          refreshToken: tokenPair.refreshToken,
          expires_in: tokenPair.expires_in,
          isExistingUser: true,
          isNewIdentity: true // Flag to indicate a new identity was linked
        };
      }
    }

    console.log(`[IdentitiesService] No existing user found, creating new user with ${createIdentityDto.platform} identity`);
    console.log(`[IdentitiesService] Setting authMethod to: ${createIdentityDto.platform}`);

    const newUser = await this.usersService.create({
      email: createIdentityDto.email || `${createIdentityDto.subjectId}@${createIdentityDto.platform}.local`,
      name: createIdentityDto.displayName || createIdentityDto.username || 'User',
      avatar: createIdentityDto.profilePicture,
      isEmailVerified: createIdentityDto.platform !== 'email', // Social platforms are pre-verified
      password: 'social-auth-no-password', // Temporary password for social auth users
      authMethod: createIdentityDto.platform // Set the correct auth method
    });


    const identity = await this.createIdentity(newUser._id.toString(), createIdentityDto);

    // IMPORTANT: Refresh user object to get the updated identities array
    const updatedUser = await this.usersService.findById(newUser._id.toString());
    console.log(`[IdentitiesService] User refreshed, identities count: ${updatedUser.identities?.length || 0}`);

    // Generate JWT tokens using the UPDATED user object (with identities)
    const tokenPair = await this.authService.loginV2(updatedUser);
    console.log(`[IdentitiesService] New user created and logged in successfully`);

    return {
      user: {
        id: updatedUser._id.toString(),
        email: updatedUser.email,
        name: updatedUser.name,
        avatar: updatedUser.avatar,
      },
      identity,
      accessToken: tokenPair.accessToken,
      refreshToken: tokenPair.refreshToken,
      expires_in: tokenPair.expires_in,
      isExistingUser: false
    };
  }

  /**
   * Create or link a new identity to an existing user (auth required)
   */
  async createIdentity(userId: string, createIdentityDto: CreateIdentityDto): Promise<Identity> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Clean up any existing duplicate identities first
    await this.cleanupDuplicateIdentities(userId);

    // Refresh user after cleanup
    const refreshedUser = await this.usersService.findById(userId);

    // Check if identity already exists for this platform and subject
    // Also check for identities without subjectId that might be duplicates
    const existingIdentity = refreshedUser.identities?.find(
      i => i.platform === createIdentityDto.platform &&
           (i.subjectId === createIdentityDto.subjectId ||
            (!i.subjectId && i.username === createIdentityDto.username))
    );

    if (existingIdentity) {
      console.log(`[IdentitiesService] Identity already exists for ${createIdentityDto.platform} platform, updating instead of creating`);
      console.log(`[IdentitiesService] Existing identity details:`, {
        platform: existingIdentity.platform,
        subjectId: existingIdentity.subjectId,
        username: existingIdentity.username,
        hasSubjectId: !!existingIdentity.subjectId
      });
      // Update existing identity instead of creating new one
      const identityIndex = refreshedUser.identities.findIndex(i =>
        i.platform === createIdentityDto.platform &&
        (i.subjectId === createIdentityDto.subjectId ||
         (!i.subjectId && i.username === createIdentityDto.username))
      );

      const updatedIdentity: Identity = {
        ...existingIdentity,
        platform: createIdentityDto.platform, // Ensure correct platform type
        username: createIdentityDto.username,
        displayName: createIdentityDto.displayName,
        profilePicture: createIdentityDto.profilePicture,
        platformData: createIdentityDto.platformData,
        // Update tokens if provided
        ...(createIdentityDto.tiktokAccessToken && { tiktokAccessToken: createIdentityDto.tiktokAccessToken }),
        ...(createIdentityDto.tiktokRefreshToken && { tiktokRefreshToken: createIdentityDto.tiktokRefreshToken }),
        ...(createIdentityDto.youtubeAccessToken && { youtubeAccessToken: createIdentityDto.youtubeAccessToken }),
        ...(createIdentityDto.youtubeRefreshToken && { youtubeRefreshToken: createIdentityDto.youtubeRefreshToken }),
        updatedAt: new Date(),
      };

      refreshedUser.identities[identityIndex] = updatedIdentity;
      await this.usersService.updateFieldsNoValidation(userId, {
        identities: refreshedUser.identities
      });

      return updatedIdentity;
    }

    console.log(`[IdentitiesService] Creating NEW identity with tokens:`, {
      platform: createIdentityDto.platform,
      subjectId: createIdentityDto.subjectId,
      username: createIdentityDto.username,
      hasTikTokToken: !!createIdentityDto.tiktokAccessToken,
      hasYouTubeToken: !!createIdentityDto.youtubeAccessToken
    });
    console.log(`[IdentitiesService] Current user has ${refreshedUser.identities?.length || 0} existing identities`);

    const newIdentity: Identity = {
      platform: createIdentityDto.platform,
      subjectId: createIdentityDto.subjectId,
      username: createIdentityDto.username,
      displayName: createIdentityDto.displayName,
      email: createIdentityDto.email,
      profilePicture: createIdentityDto.profilePicture,
      platformData: createIdentityDto.platformData,
      // Preserve token fields if they exist
      ...(createIdentityDto.tiktokAccessToken && { tiktokAccessToken: createIdentityDto.tiktokAccessToken }),
      ...(createIdentityDto.tiktokRefreshToken && { tiktokRefreshToken: createIdentityDto.tiktokRefreshToken }),
      ...(createIdentityDto.youtubeAccessToken && { youtubeAccessToken: createIdentityDto.youtubeAccessToken }),
      ...(createIdentityDto.youtubeRefreshToken && { youtubeRefreshToken: createIdentityDto.youtubeRefreshToken }),
      isActive: true,
      lastUsedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    console.log(`[IdentitiesService] Created identity object with tokens:`, {
      platform: newIdentity.platform,
      hasTikTokToken: !!newIdentity.tiktokAccessToken,
      hasYouTubeToken: !!newIdentity.youtubeAccessToken
    });

    // Add identity to user
    if (!user.identities) {
      user.identities = [];
    }
    user.identities.push(newIdentity);

    // Update user using updateFieldsNoValidation to avoid DTO validation issues
    try {
      const updatedUser = await this.usersService.updateFieldsNoValidation(userId, { identities: user.identities });
      console.log('User updated successfully, new identities count:', updatedUser.identities?.length || 0);
      return newIdentity;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Link a new platform identity using OAuth code
   * Note: This only stores identity info, NOT tokens
   * Tokens are handled separately in Account-Connect for management
   */
  async linkIdentity(userId: string, request: CreateIdentityRequest): Promise<IdentityLinkResult> {
    try {
      // Exchange OAuth code for identity token (minimal scopes)
      const tokens = await this.oauthService.exchangeCodeForIdentity(
        request.platform,
        request.code,
        request.redirectUri
      );

      // Get profile from platform using the token
      const profile = await this.getPlatformProfile(request.platform, tokens.accessToken);

      // Create identity DTO (NO tokens stored here)
      const identityDto: CreateIdentityDto = {
        platform: request.platform,
        subjectId: profile.subjectId,
        username: profile.username,
        displayName: profile.displayName,
        email: profile.email,
        profilePicture: profile.profilePicture,
        platformData: profile.platformData,
      };

      // Create the identity (tokens are NOT stored)
      const identity = await this.createIdentity(userId, identityDto);

      return {
        success: true,
        identity,
        isNewUser: false,
        // Note: tokens are available here but NOT stored in identity
        // They can be passed to Account-Connect if needed for management
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Validate an existing identity token
   */
  async validateIdentity(userId: string, platform: IdentityPlatform): Promise<IdentityValidationResult> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      return { isValid: false, error: 'User not found' };
    }

    const identity = user.identities?.find(i => i.platform === platform && i.isActive);
    if (!identity) {
      return { isValid: false, error: 'Identity not found' };
    }

    // Identity is valid if it exists and is active
    // Token validation happens in Account-Connect service
    return { isValid: true, identity: identity as Identity };
  }

  /**
   * Refresh an identity profile from the platform
   * Note: This requires re-authentication since we don't store tokens in identities
   */
  async refreshIdentityProfile(userId: string, platform: IdentityPlatform, oauthCode?: string): Promise<Identity> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const identity = user.identities?.find(i => i.platform === platform && i.isActive);
    if (!identity) {
      throw new NotFoundException(`Active identity not found for platform: ${platform}`);
    }

    if (!oauthCode) {
      throw new BadRequestException(`OAuth code required to refresh profile. Re-authenticate with ${platform} to get fresh data.`);
    }

    try {
      // Exchange OAuth code for fresh token
      const tokens = await this.oauthService.exchangeCodeForIdentity(platform, oauthCode);

      // Get fresh profile from platform
      const profile = await this.getPlatformProfile(platform, tokens.accessToken);

      // Update identity with fresh data (NO tokens stored)
      const updatedIdentity = {
        ...identity,
        username: profile.username,
        displayName: profile.displayName,
        email: profile.email,
        profilePicture: profile.profilePicture,
        platformData: profile.platformData,
        updatedAt: new Date(),
      };

      // Update in user document
      const identityIndex = user.identities.findIndex(i =>
        i.platform === platform && i.subjectId === identity.subjectId
      );

      if (identityIndex !== -1) {
        user.identities[identityIndex] = updatedIdentity;
        await this.usersService.updateFieldsNoValidation(userId, { identities: user.identities });
      }

      return updatedIdentity as Identity;
    } catch (error) {
      throw new BadRequestException(`Failed to refresh profile for ${platform}: ${error.message}`);
    }
  }

  /**
   * Deactivate an identity (soft delete)
   */
  async deactivateIdentity(userId: string, platform: IdentityPlatform): Promise<void> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const identity = user.identities?.find(i => i.platform === platform && i.isActive);
    if (!identity) {
      throw new NotFoundException(`Active identity not found for platform: ${platform}`);
    }

    // Soft delete by setting isActive to false
    identity.isActive = false;
    identity.updatedAt = new Date();

    await this.usersService.updateFieldsNoValidation(userId, { identities: user.identities });
  }

  /**
   * Get platform profile using OAuth service
   */
  private async getPlatformProfile(platform: IdentityPlatform, accessToken: string) {
    try {
      let profile;
      switch (platform) {
        case IdentityPlatform.TIKTOK:
          profile = await this.oauthService.getTikTokProfile(accessToken);
          break;
        case IdentityPlatform.INSTAGRAM:
          profile = await this.oauthService.getInstagramProfile(accessToken);
          break;
        case IdentityPlatform.YOUTUBE:
          profile = await this.oauthService.getYouTubeProfile(accessToken);
          break;
        case IdentityPlatform.LINKEDIN:
          profile = await this.oauthService.getLinkedInProfile(accessToken);
          break;
        default:
          throw new BadRequestException(`Unsupported platform: ${platform}`);
      }

      return profile;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Find user by platform identity - Optimized with MongoDB query
   */
  async findUserByPlatformIdentity(platform: IdentityPlatform, subjectId: string): Promise<string | null> {
    console.log(`[IdentitiesService] findUserByPlatformIdentity: Searching for ${platform} identity with subjectId: ${subjectId}`);

    try {
      // Use MongoDB query to find user by identity efficiently
      const user = await this.usersService.findByPlatformIdentity(platform, subjectId);

      if (user) {
        console.log(`[IdentitiesService] Found matching user: ${user._id}`);
        return user._id.toString();
      }

      console.log(`[IdentitiesService] No matching user found for ${platform} identity with subjectId: ${subjectId}`);
      return null;
    } catch (error) {
      console.error(`[IdentitiesService] Error finding user by platform identity:`, error);

      // Fallback to the old method if the optimized query fails
      console.log(`[IdentitiesService] Falling back to legacy search method`);
      const users = await this.usersService.findAll();
      console.log(`[IdentitiesService] findUserByPlatformIdentity: Found ${users.length} total users to search through`);

      for (const user of users) {
        console.log(`[IdentitiesService] Checking user ${user._id} with ${user.identities?.length || 0} identities`);

        if (user.identities && user.identities.length > 0) {
          for (const identity of user.identities) {
            console.log(`[IdentitiesService] Checking identity: platform=${identity.platform}, subjectId=${identity.subjectId}, isActive=${identity.isActive}`);
            console.log(`[IdentitiesService] Comparing: stored subjectId="${identity.subjectId}" vs searched subjectId="${subjectId}"`);

            if (identity.platform === platform && identity.subjectId === subjectId && identity.isActive) {
              console.log(`[IdentitiesService] Found matching user: ${user._id}`);
              return user._id.toString();
            }
          }
        }
      }

      console.log(`[IdentitiesService] No matching user found for ${platform} identity with subjectId: ${subjectId}`);
      return null;
    }
  }

  // ===== OAUTH REGISTRATION METHODS =====

  /**
   * Get TikTok OAuth URL for registration (identity only)
   */
  getTikTokAuthUrl(): { url: string } {
    const clientKey = this.configService.get<string>("TIKTOK_CLIENT_KEY");
    const redirectUri = this.configService.get<string>("TIKTOK_REDIRECT_URI_V2") || "https://uat.groreels.com/v2/identities/tiktok/callback";
    const scope = ["user.info.basic", "user.info.profile"].join(",");
    const state = Math.random().toString(36).substring(7);

    const url = `https://www.tiktok.com/v2/auth/authorize/?client_key=${clientKey}&scope=${scope}&response_type=code&redirect_uri=${redirectUri}&state=${state}`;
    console.log('TikTok OAuth URL (identity):', url);
    return { url };
  }

  /**
   * Get TikTok OAuth URL for management (full access)
   */
  getTikTokManagementAuthUrl(): { url: string } {
    const clientKey = this.configService.get<string>("TIKTOK_CLIENT_KEY");
    const redirectUri = this.configService.get<string>("TIKTOK_MANAGEMENT_REDIRECT_URI_V2") || "https://uat.groreels.com/v2/identities/tiktok/management/callback";
    const scope = ["user.info.basic", "user.info.profile", "video.list", "video.upload"].join(",");
    const state = Math.random().toString(36).substring(7);

    const url = `https://www.tiktok.com/v2/auth/authorize/?client_key=${clientKey}&scope=${scope}&response_type=code&redirect_uri=${redirectUri}&state=${state}`;
    console.log('TikTok OAuth URL (management):', url);
    return { url };
  }

  /**
   * Handle TikTok OAuth callback for registration
   */
  async handleTikTokCallback(code: string, state: string): Promise<{ accessToken: string; refreshToken: string }> {
    console.log(`[IdentitiesService] TikTok OAuth callback started`);
    try {
      console.log(`[IdentitiesService] Exchanging TikTok OAuth code for tokens...`);
      const tokens = await this.oauthService.exchangeCodeForIdentity('tiktok', code);
      console.log(`[IdentitiesService] TikTok tokens received successfully`);

      console.log(`[IdentitiesService] Fetching TikTok profile...`);
      const profile = await this.oauthService.getTikTokProfile(tokens.accessToken);
      console.log(`[IdentitiesService] TikTok profile received for user: ${profile.username || profile.subjectId}`);


      const identityDto: CreateIdentityDto = {
        platform: IdentityPlatform.TIKTOK,
        subjectId: profile.subjectId,
        username: profile.username,
        displayName: profile.displayName,
        email: profile.email,
        profilePicture: profile.profilePicture,
        platformData: profile.platformData,
      };

      // Register user with identity
      const result = await this.registerWithIdentity(identityDto);
      console.log(`[IdentitiesService] TikTok flow completed - isExistingUser: ${result.isExistingUser}`);

      return {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken
      };
    } catch (error) {
      console.error(`[IdentitiesService] TikTok OAuth callback failed:`, error);
      throw error;
    }
  }

  /**
   * Handle TikTok OAuth callback for management (full access)
   */
  async handleTikTokManagementCallback(code: string, state: string): Promise<{
    accessToken: string;
    refreshToken: string;
    tiktokAccessToken: string;
    tiktokRefreshToken: string;
    profile: any;
    platformData: any;
  }> {
    console.log(`[IdentitiesService] TikTok Management OAuth callback started`);
    try {
      // Exchange code for management tokens using OAuth service
      console.log(`[IdentitiesService] Exchanging TikTok OAuth code for management tokens...`);
      const tokens = await this.oauthService.exchangeCodeForManagement('tiktok', code);
      console.log(`[IdentitiesService] TikTok management tokens received successfully`);

      // Get detailed profile from TikTok using management token
      console.log(`[IdentitiesService] Fetching detailed TikTok profile with management token...`);
      const detailedProfile = await this.getTikTokManagementProfile(tokens.accessToken);
      console.log(`[IdentitiesService] Detailed TikTok profile received for user: ${detailedProfile.username || detailedProfile.display_name}`);

      // Generate proper email like TikTok
      const email = this.generatePlatformEmail('tiktok', detailedProfile.subjectId);

      // Create identity DTO with tokens stored in identity
      const identityDto: CreateIdentityDto = {
        platform: IdentityPlatform.TIKTOK,
        subjectId: detailedProfile.subjectId,
        username: detailedProfile.username,
        displayName: detailedProfile.displayName,
        email: email,
        profilePicture: detailedProfile.profilePicture,
        tiktokAccessToken: tokens.accessToken,        // Store tokens in identity
        tiktokRefreshToken: tokens.refreshToken,      // Store tokens in identity
        platformData: detailedProfile.platformData,   // Keep metrics object structure
      };

      // For management OAuth, we need to update existing identity with new tokens
      console.log(`[IdentitiesService] Processing TikTok management identity update...`);
      const result = await this.updateExistingIdentityWithTokens(identityDto);
      console.log(`[IdentitiesService] TikTok management flow completed - isExistingUser: ${result.isExistingUser}`);

      // Create AccountConnect entry for ongoing management
      console.log(`[IdentitiesService] Checking if AccountConnect should be created:`, {
        hasUser: !!result.user,
        userId: result.user?.id,
        isExistingUser: result.isExistingUser
      });

      if (result.user?.id) {
        console.log(`[IdentitiesService] Creating AccountConnect entry for user: ${result.user.id}`);
        await this.createAccountConnectEntry(result.user.id, {
          ...detailedProfile,
          platform: 'tiktok'
        }, tokens);
      } else {
        console.log(`[IdentitiesService] No user ID available, skipping AccountConnect creation`);
      }

      return {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        tiktokAccessToken: tokens.accessToken,
        tiktokRefreshToken: tokens.refreshToken,
        profile: detailedProfile,
        platformData: detailedProfile.platformData
      };
    } catch (error) {
      console.error(`[IdentitiesService] TikTok Management OAuth callback failed:`, error);
      throw error;
    }
  }

  /**
   * Get detailed TikTok profile using management token
   */
  private async getTikTokManagementProfile(accessToken: string): Promise<any> {
    try {
      // First, try to get basic user info
      const response = await axios.get(
        'https://open.tiktokapis.com/v2/user/info/',
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          params: {
            fields: [
              'open_id', 'union_id', 'avatar_url', 'avatar_url_100', 'avatar_large_url',
              'display_name', 'bio_description', 'profile_deep_link', 'is_verified',
              'username', 'follower_count', 'following_count', 'likes_count', 'video_count'
            ].join(','),
          },
        }
      );

      const user = response.data.data.user;

      // Get videos to calculate real metrics
      let videos = [];
      let totalViews = 0;
      let totalLikes = 0;
      let totalComments = 0;
      let engagementRate = 0;
      let postingFrequency = 0;

      try {
        // Fetch videos to calculate real metrics
        // Fetch videos using TikTok v2 video/list endpoint (POST request)
        const videosResponse = await axios.post(
          'https://open.tiktokapis.com/v2/video/list/',
          {
            max_count: 20, // TikTok API limit is 20 videos max
          },
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            params: {
              fields: [
                'title', 'cover_image_url', 'video_description', 'create_time'
              ].join(','),
            },
          }
        );

        if (videosResponse.data?.data?.videos) {
          videos = videosResponse.data.data.videos;

          // Calculate real metrics from videos
          // Note: Since we can't get stats from the video list API, we'll use basic counts
          videos.forEach(video => {
            // Basic video count for posting frequency calculation
            // Individual video stats are not available in the list endpoint
          });

          // Calculate engagement rate using available data
          if (totalViews > 0) {
            engagementRate = this.analyticsService['calculateEngagementRate']({
              viewCount: totalViews,
              likeCount: totalLikes,
              commentCount: totalComments
            });
          } else if (totalLikes > 0 || totalComments > 0) {
            // If we have engagement but no views, calculate based on followers
            // This is a fallback calculation when views are not available
            const followerCount = user.follower_count || 25; // Use actual follower count
            const totalEngagement = totalLikes + totalComments;
            engagementRate = followerCount > 0 ? (totalEngagement / followerCount) * 100 : 0;
          }

          // Calculate posting frequency (videos per month)
          if (videos.length > 0) {
            const firstVideoDate = new Date(videos[0].create_time * 1000);
            const now = new Date();
            const monthsDiff = (now.getTime() - firstVideoDate.getTime()) / (1000 * 60 * 60 * 24 * 30);
            postingFrequency = monthsDiff > 0 ? Math.round((videos.length / monthsDiff) * 100) / 100 : videos.length;
          }
        }

        // Fallback calculations if no videos found
        if (videos.length === 0) {
          totalViews = user.likes_count || 0; // Using likes as proxy for engagement
          totalLikes = user.likes_count || 0;
          totalComments = 0; // Not available in basic profile
          postingFrequency = user.video_count || 0;
        }
      } catch (videoError) {
        console.log('Could not fetch videos for metrics calculation:', videoError.message);
        if (videoError.response) {
          console.error('TikTok API Error Status:', videoError.response.status);
          console.error('TikTok API Error Data:', videoError.response.data);
          console.error('TikTok API Error Headers:', videoError.response.headers);
        }
        // Continue with basic profile data
      }

      // Return new flattened structure with tokens and metrics object
      console.log(`[IdentitiesService] getTikTokManagementProfile: TikTok API returned open_id: ${user.open_id}`);
      return {
        // Profile fields at top level
        subjectId: user.open_id,
        username: user.username,
        displayName: user.display_name,
        profilePicture: user.avatar_url || user.avatar_large_url,

        // Platform data with metrics object
        platformData: {
          metrics: {
            followerCount: user.follower_count || 0,
            followingCount: user.following_count || 0,
            totalLikes: user.likes_count || 0,
            totalViews: totalViews,
            totalComments: totalComments,
            engagementRate: Math.round(engagementRate * 100) / 100,
            postingFrequency: postingFrequency,
            videoCount: user.video_count || 0
          },
          bioDescription: user.bio_description,
          profileDeepLink: user.profile_deep_link,
          isVerified: user.is_verified,
          openId: user.open_id,
          unionId: user.union_id,
          avatarUrl: user.avatar_url,
          avatarUrl100: user.avatar_url_100,
          avatarLargeUrl: user.avatar_large_url
        }
      };
    } catch (error) {
      console.error('Failed to fetch detailed TikTok profile:', error);
      throw new Error('Failed to fetch detailed TikTok profile');
    }
  }

  /**
   * Get Instagram OAuth URL for registration
   */
  getInstagramAuthUrl(): { url: string } {
    const clientId = this.configService.get<string>("INSTAGRAM_CLIENT_ID");
    const redirectUri = "https://uat.groreels.com/v2/identities/instagram/callback";
    const scope = ["instagram_business_basic"].join(",");
    const state = Math.random().toString(36).substring(7);

    const url = `https://www.instagram.com/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}&response_type=code&state=${state}`;
      console.log('TikTok OAuth URL:', url);
    return { url };
  }

  /**
   * Handle Instagram OAuth callback for registration
   */
  async handleInstagramCallback(code: string, state: string): Promise<{ accessToken: string; refreshToken: string }> {
    console.log(`[IdentitiesService] Instagram OAuth callback started`);
    try {
      // Exchange code for tokens using OAuth service
      console.log(`[IdentitiesService] Exchanging Instagram OAuth code for tokens...`);
      const tokens = await this.oauthService.exchangeCodeForIdentity('instagram', code);
      console.log(`[IdentitiesService] Instagram tokens received successfully`);

      // Get profile from Instagram
      console.log(`[IdentitiesService] Fetching Instagram profile...`);
      const profile = await this.oauthService.getInstagramProfile(tokens.accessToken);
      console.log(`[IdentitiesService] Instagram profile received for user: ${profile.username || profile.subjectId}`);

      // Create identity DTO
      const identityDto: CreateIdentityDto = {
        platform: IdentityPlatform.INSTAGRAM,
        subjectId: profile.subjectId,
        username: profile.username,
        displayName: profile.displayName,
        email: profile.email,
        profilePicture: profile.profilePicture,
        platformData: profile.platformData,
      };

      // Register user with identity
      console.log(`[IdentitiesService] Processing Instagram registration/login...`);
      const result = await this.registerWithIdentity(identityDto);
      console.log(`[IdentitiesService] Instagram flow completed - isExistingUser: ${result.isExistingUser}`);

      return {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken
      };
    } catch (error) {
      console.error(`[IdentitiesService] Instagram OAuth callback failed:`, error);
      throw error;
    }
  }

  /**
   * Get YouTube OAuth URL for registration (identity only)
   */
  getYouTubeAuthUrl(): { url: string } {
    const clientId = this.configService.get<string>("YOUTUBE_CLIENT_ID");
    const redirectUri = this.configService.get<string>("YOUTUBE_REDIRECT_URI_V2") || "http://localhost:3000/v2/identities/youtube/callback";
    const scope = ["https://www.googleapis.com/auth/userinfo.profile", "https://www.googleapis.com/auth/userinfo.email", "openid", "email"].join(" ");
    const state = Math.random().toString(36).substring(7);
    const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${encodeURIComponent(scope)}&response_type=code&state=${state}&access_type=offline&prompt=consent`;
    console.log('YouTube OAuth URL (identity):', url);
    return { url };
  }

  /**
   * Get YouTube OAuth URL for management (full access)
   */
  getYouTubeManagementAuthUrl(): { url: string } {
    const clientId = this.configService.get<string>("YOUTUBE_CLIENT_ID");
    const redirectUri = this.configService.get<string>("YOUTUBE_MANAGEMENT_REDIRECT_URI_V2") || "http://localhost:3000/v2/identities/youtube/management/callback";
    const scope = [
      "https://www.googleapis.com/auth/userinfo.profile",
      "https://www.googleapis.com/auth/userinfo.email",
      "openid",
      "email",
      "https://www.googleapis.com/auth/youtube.upload",
      "https://www.googleapis.com/auth/youtube.readonly",
      "https://www.googleapis.com/auth/youtube.force-ssl"
    ].join(" ");
    const state = Math.random().toString(36).substring(7);
    const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${encodeURIComponent(scope)}&response_type=code&state=${state}&access_type=offline&prompt=consent`;
    console.log('YouTube OAuth URL (management):', url);
    return { url };
  }

  /**
   * Handle YouTube OAuth callback for registration
   */
  async handleYouTubeCallback(code: string, state: string): Promise<{ accessToken: string; refreshToken: string }> {
    console.log(`[IdentitiesService] YouTube OAuth callback started`);
    try {
      // Exchange code for tokens using OAuth service
      console.log(`[IdentitiesService] Exchanging YouTube OAuth code for tokens...`);
      const tokens = await this.oauthService.exchangeCodeForIdentity('youtube', code);
      console.log(`[IdentitiesService] YouTube tokens received successfully`);

      // Get profile from YouTube
      console.log(`[IdentitiesService] Fetching YouTube profile...`);
      const profile = await this.oauthService.getYouTubeProfile(tokens.accessToken);
      console.log(`[IdentitiesService] YouTube profile received for user: ${profile.username || profile.subjectId}`);

      // Create identity DTO
      const identityDto: CreateIdentityDto = {
        platform: IdentityPlatform.YOUTUBE,
        subjectId: profile.subjectId,
        username: profile.username,
        displayName: profile.displayName,
        email: profile.email,
        profilePicture: profile.profilePicture,
        platformData: profile.platformData,
      };

      // Register user with identity
      console.log(`[IdentitiesService] Processing YouTube registration/login...`);
      const result = await this.registerWithIdentity(identityDto);
      console.log(`[IdentitiesService] YouTube flow completed - isExistingUser: ${result.isExistingUser}`);

      return {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken
      };
    } catch (error) {
      console.error(`[IdentitiesService] YouTube OAuth callback failed:`, error);
      throw error;
    }
  }

  /**
   * Handle YouTube OAuth callback for management (full access)
   */
  async handleYouTubeManagementCallback(code: string, state: string): Promise<{
    accessToken: string;
    refreshToken: string;
    youtubeAccessToken: string;
    youtubeRefreshToken: string;
    profile: any;
    platformData: any;
  }> {
    console.log(`[IdentitiesService] YouTube Management OAuth callback started`);
    try {
      // Exchange code for management tokens using OAuth service
      console.log(`[IdentitiesService] Exchanging YouTube OAuth code for management tokens...`);
      const tokens = await this.oauthService.exchangeCodeForManagement('youtube', code);
      console.log(`[IdentitiesService] YouTube management tokens received successfully`);

      // Get detailed profile from YouTube using management token
      console.log(`[IdentitiesService] Fetching detailed YouTube profile with management token...`);
      const detailedProfile = await this.getYouTubeManagementProfile(tokens.accessToken);
      console.log(`[IdentitiesService] Detailed YouTube profile received for user: ${detailedProfile.displayName || detailedProfile.username}`);
      console.log(`[IdentitiesService] YouTube channel status: ${detailedProfile.platformData?.hasChannel ? 'Channel exists' : 'No channel created yet'}`);

      // Generate proper email like TikTok
      const email = this.generatePlatformEmail('youtube', detailedProfile.subjectId);

      // Create identity DTO with tokens stored in identity
      const identityDto: CreateIdentityDto = {
        platform: IdentityPlatform.YOUTUBE,
        subjectId: detailedProfile.subjectId,
        username: detailedProfile.username,
        displayName: detailedProfile.displayName,
        email: email,
        profilePicture: detailedProfile.profilePicture,
        youtubeAccessToken: tokens.accessToken,        // Store tokens in identity
        youtubeRefreshToken: tokens.refreshToken,      // Store tokens in identity
        platformData: detailedProfile.platformData,    // Keep metrics object structure
      };

      // Register user with identity (if not already exists)
      console.log(`[IdentitiesService] Processing YouTube management registration/login...`);
      const result = await this.registerWithIdentity(identityDto);
      console.log(`[IdentitiesService] YouTube management flow completed - isExistingUser: ${result.isExistingUser}`);
      console.log(`[IdentitiesService] Result user object:`, {
        hasUser: !!result.user,
        userId: result.user?.id,
        userEmail: result.user?.email,
        userType: typeof result.user
      });

      // Create AccountConnect entry for ongoing management
      if (result.user?.id) {
        console.log(`[IdentitiesService] Creating AccountConnect entry for user: ${result.user.id}`);
        // Add platform property to the profile data
        const profileWithPlatform = {
          ...detailedProfile,
          platform: 'youtube'
        };
        console.log(`[IdentitiesService] Profile with platform:`, {
          platform: profileWithPlatform.platform,
          subjectId: profileWithPlatform.subjectId,
          username: profileWithPlatform.username
        });
        await this.createAccountConnectEntry(result.user.id, profileWithPlatform, tokens);
      } else {
        console.log(`[IdentitiesService] No user ID available, skipping AccountConnect creation`);
        console.log(`[IdentitiesService] Result object:`, result);
      }

      return {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        youtubeAccessToken: tokens.accessToken,
        youtubeRefreshToken: tokens.refreshToken,
        profile: detailedProfile,
        platformData: detailedProfile.platformData
      };
    } catch (error) {
      console.error(`[IdentitiesService] YouTube Management OAuth callback failed:`, error);

      // Provide more specific error context
      if (error.message?.includes('No YouTube channel found')) {
        console.error(`[IdentitiesService] User does not have a YouTube channel created yet`);
        console.error(`[IdentitiesService] This is normal for users who haven't set up their YouTube channel`);
        // Don't throw - allow the flow to continue with a minimal profile
        return {
          accessToken: null,
          refreshToken: null,
          youtubeAccessToken: null,
          youtubeRefreshToken: null,
          profile: {
            subjectId: 'unknown',
            username: 'youtube_user',
            displayName: 'YouTube User',
            email: 'unknown@youtube.com',
            profilePicture: null,
            platformData: {
              hasChannel: false,
              error: 'No YouTube channel found - user needs to create a channel first'
            }
          },
          platformData: {
            hasChannel: false,
            error: 'No YouTube channel found - user needs to create a channel first'
          }
        };
      } else if (error.message?.includes('Invalid OAuth token')) {
        console.error(`[IdentitiesService] OAuth token validation failed - insufficient permissions`);
        throw new Error('YouTube OAuth failed: Invalid token or insufficient permissions');
      } else {
        console.error(`[IdentitiesService] Unexpected error during YouTube OAuth callback:`, {
          message: error.message,
          stack: error.stack,
          code: error.code
        });
        throw new Error(`YouTube OAuth callback failed: ${error.message}`);
      }
    }
  }

  /**
   * Clean up duplicate identities for a user
   */
  async cleanupDuplicateIdentities(userId: string): Promise<void> {
    const user = await this.usersService.findById(userId);
    if (!user || !user.identities) return;

    const seen = new Map();
    const uniqueIdentities: any[] = [];

    // First pass: identify duplicates and keep the most recent ones
    for (const identity of user.identities) {
      // Skip identities without platform
      if (!identity.platform) {
        console.log(`[IdentitiesService] Skipping identity without platform:`, {
          platform: identity.platform,
          subjectId: identity.subjectId,
          username: identity.username
        });
        continue;
      }

      // Create a key for duplicate detection
      // For TikTok platform, we need to handle the case where some identities have subjectId and others don't
      // but they represent the same user (same username)
      let key;
      if (identity.platform === 'tiktok') {
        // For TikTok, use username as the primary key since subjectId might be missing
        key = `${identity.platform}:${identity.username}`;
      } else {
        // For other platforms, use subjectId if available, otherwise username
        key = identity.subjectId
          ? `${identity.platform}:${identity.subjectId}`
          : `${identity.platform}:${identity.username}`;
      }

      if (seen.has(key)) {
        console.log(`[IdentitiesService] Removing duplicate identity: ${key}`);
        const existing = seen.get(key);

        // Priority logic: prefer identities without subjectId over those with subjectId
        // This is because the user wants to keep the original identity (without subjectId)
        const currentHasSubjectId = !!identity.subjectId;
        const existingHasSubjectId = !!existing.subjectId;

        let shouldReplace = false;

        if (currentHasSubjectId && !existingHasSubjectId) {
          // Current has subjectId, existing doesn't - keep existing (don't replace)
          console.log(`[IdentitiesService] Keeping existing identity without subjectId over new one with subjectId`);
          shouldReplace = false;
        } else if (!currentHasSubjectId && existingHasSubjectId) {
          // Current doesn't have subjectId, existing does - replace with current
          console.log(`[IdentitiesService] Replacing identity with subjectId with one without subjectId`);
          shouldReplace = true;
        } else {
          // Both have same subjectId status, use time-based comparison
          const currentTime = new Date(identity.updatedAt || identity.createdAt);
          const existingTime = new Date(existing.updatedAt || existing.createdAt);
          shouldReplace = currentTime > existingTime;
          console.log(`[IdentitiesService] Time-based comparison: current=${currentTime.toISOString()}, existing=${existingTime.toISOString()}, replace=${shouldReplace}`);
        }

        if (shouldReplace) {
          const index = uniqueIdentities.findIndex(ui => ui === existing);
          if (index !== -1) {
            uniqueIdentities[index] = identity;
          }
          seen.set(key, identity);
        }
        // If not replacing, keep the existing one (do nothing)
      } else {
        seen.set(key, identity);
        uniqueIdentities.push(identity);
      }
    }

    if (uniqueIdentities.length !== user.identities.length) {
      console.log(`[IdentitiesService] Cleaned up ${user.identities.length - uniqueIdentities.length} duplicate identities for user ${userId}`);
      await this.usersService.updateFieldsNoValidation(userId, { identities: uniqueIdentities });
    }
  }

  /**
   * Clean up duplicate identities for a specific user (admin utility)
   * This method can be called manually to clean up duplicates for a user
   */
  async cleanupUserDuplicateIdentities(userId: string): Promise<{ cleaned: number; originalCount: number; finalCount: number }> {
    console.log(`[IdentitiesService] Starting cleanup of duplicate identities for user ${userId}...`);

    const user = await this.usersService.findById(userId);
    if (!user || !user.identities) {
      return { cleaned: 0, originalCount: 0, finalCount: 0 };
    }

    const originalCount = user.identities.length;
    console.log(`[IdentitiesService] User ${userId} has ${originalCount} identities before cleanup`);

    // Log all identities before cleanup
    user.identities.forEach((identity, index) => {
      console.log(`[IdentitiesService] Identity ${index}:`, {
        platform: identity.platform,
        subjectId: identity.subjectId,
        username: identity.username,
        hasSubjectId: !!identity.subjectId,
        createdAt: identity.createdAt,
        updatedAt: identity.updatedAt
      });
    });

    await this.cleanupDuplicateIdentities(userId);

    const updatedUser = await this.usersService.findById(userId);
    const finalCount = updatedUser.identities?.length || 0;
    const cleaned = originalCount - finalCount;

    console.log(`[IdentitiesService] Cleanup completed for user ${userId}. Removed ${cleaned} duplicate identities (${originalCount} -> ${finalCount})`);

    return { cleaned, originalCount, finalCount };
  }

  /**
   * Clean up duplicate identities for all users (admin utility)
   */
  async cleanupAllDuplicateIdentities(): Promise<{ cleaned: number; totalUsers: number }> {
    console.log(`[IdentitiesService] Starting cleanup of duplicate identities for all users...`);

    const users = await this.usersService.findAll();
    let totalCleaned = 0;

    for (const user of users) {
      if (user.identities && user.identities.length > 0) {
        const originalCount = user.identities.length;
        await this.cleanupDuplicateIdentities(user._id.toString());

        // Check if any duplicates were removed
        const updatedUser = await this.usersService.findById(user._id.toString());
        if (updatedUser.identities.length < originalCount) {
          totalCleaned += (originalCount - updatedUser.identities.length);
        }
      }
    }

    console.log(`[IdentitiesService] Cleanup completed. Removed ${totalCleaned} duplicate identities across ${users.length} users`);
    return { cleaned: totalCleaned, totalUsers: users.length };
  }

  /**
   * Update existing identity with new tokens (for management OAuth)
   */
  async updateExistingIdentityWithTokens(identityDto: CreateIdentityDto): Promise<{ user: any; identity: Identity; accessToken: string; refreshToken: string; expires_in: string; isExistingUser?: boolean }> {
    console.log(`[IdentitiesService] updateExistingIdentityWithTokens: Updating ${identityDto.platform} identity with new tokens`);
    console.log(`[IdentitiesService] updateExistingIdentityWithTokens: Searching for subjectId: ${identityDto.subjectId}`);

    // Find existing user with this identity
    const existingUserId = await this.findUserByPlatformIdentity(identityDto.platform, identityDto.subjectId);
    if (!existingUserId) {
      // If no existing user, fall back to registration
      console.log(`[IdentitiesService] No existing user found, falling back to registration`);
      return this.registerWithIdentity(identityDto);
    }

    console.log(`[IdentitiesService] Existing user found, updating ${identityDto.platform} identity with new tokens`);

    // Clean up any existing duplicate identities first
    await this.cleanupDuplicateIdentities(existingUserId);

    const existingUser = await this.usersService.findById(existingUserId);

    // Find the existing identity - check for duplicates first
    const identityIndex = existingUser.identities.findIndex(i =>
      i.platform === identityDto.platform && i.subjectId === identityDto.subjectId
    );

    // Check for duplicate identities and remove them
    const duplicateIdentities = existingUser.identities.filter((identity, index) =>
      identity.platform === identityDto.platform &&
      identity.subjectId === identityDto.subjectId &&
      index !== identityIndex
    );

    if (duplicateIdentities.length > 0) {
      console.log(`[IdentitiesService] Found ${duplicateIdentities.length} duplicate identities, removing them`);
      // Remove duplicate identities
      existingUser.identities = existingUser.identities.filter((identity, index) =>
        !(identity.platform === identityDto.platform &&
          identity.subjectId === identityDto.subjectId &&
          index !== identityIndex)
      );
      await this.usersService.updateUser(existingUserId, { identities: existingUser.identities });
    }

    if (identityIndex === -1) {
      console.log(`[IdentitiesService] Identity not found, creating new identity`);
      const newIdentity = await this.createIdentity(existingUserId, identityDto);
      const updatedUser = await this.usersService.findById(existingUserId);
      const tokenPair = await this.authService.loginV2(updatedUser);

      return {
        user: {
          id: updatedUser._id.toString(),
          email: updatedUser.email,
          name: updatedUser.name,
          avatar: updatedUser.avatar,
        },
        identity: newIdentity,
        accessToken: tokenPair.accessToken,
        refreshToken: tokenPair.refreshToken,
        expires_in: tokenPair.expires_in,
        isExistingUser: true
      };
    }

    // Update existing identity with new tokens and data
    const existingIdentity = existingUser.identities[identityIndex];
    const updatedIdentity = {
      ...existingIdentity,
      platform: identityDto.platform, // Ensure correct platform type
      username: identityDto.username,
      displayName: identityDto.displayName,
      profilePicture: identityDto.profilePicture,
      platformData: identityDto.platformData,
      // Add new tokens
      ...(identityDto.tiktokAccessToken && { tiktokAccessToken: identityDto.tiktokAccessToken }),
      ...(identityDto.tiktokRefreshToken && { tiktokRefreshToken: identityDto.tiktokRefreshToken }),
      ...(identityDto.youtubeAccessToken && { youtubeAccessToken: identityDto.youtubeAccessToken }),
      ...(identityDto.youtubeRefreshToken && { youtubeRefreshToken: identityDto.youtubeRefreshToken }),
      updatedAt: new Date(),
    } as Identity;

    // Update the identity in the user document
    existingUser.identities[identityIndex] = updatedIdentity;
    await this.usersService.updateFieldsNoValidation(existingUserId, {
      identities: existingUser.identities
    });

    // Refresh user object
    const refreshedUser = await this.usersService.findById(existingUserId);
    const tokenPair = await this.authService.loginV2(refreshedUser);

    console.log(`[IdentitiesService] Identity updated successfully with new tokens`);

    return {
      user: {
        id: refreshedUser._id.toString(),
        email: refreshedUser.email,
        name: refreshedUser.name,
        avatar: refreshedUser.avatar,
      },
      identity: updatedIdentity,
      accessToken: tokenPair.accessToken,
      refreshToken: tokenPair.refreshToken,
      expires_in: tokenPair.expires_in,
      isExistingUser: true
    };
  }

  /**
   * Generate platform-specific email like TikTok
   */
  private generatePlatformEmail(platform: string, subjectId: string): string {
    if (!subjectId) {
      // Fallback to a random ID if subjectId is undefined
      const randomId = Math.random().toString(36).substring(2, 15);
      return `-0000${randomId}@${platform}.local`;
    }
    const sanitizedId = subjectId.replace(/[^a-zA-Z0-9]/g, '');
    return `-0000${sanitizedId}@${platform}.local`;
  }

  /**
   * Create AccountConnect entry for management OAuth
   */
  private async createAccountConnectEntry(userId: string, profileData: any, tokens: any): Promise<void> {
    console.log(`[IdentitiesService] createAccountConnectEntry called with:`, {
      userId,
      platform: profileData.platform,
      hasProfileData: !!profileData,
      hasTokens: !!tokens
    });

    try {
      console.log(`[IdentitiesService] Creating AccountConnect entry for user ${userId} on ${profileData.platform}`);
      console.log(`[IdentitiesService] Token details:`, {
        hasAccessToken: !!tokens.accessToken,
        hasRefreshToken: !!tokens.refreshToken,
        expiresIn: tokens.expiresIn,
        expiresInType: typeof tokens.expiresIn,
        currentTime: Math.floor(Date.now() / 1000),
        calculatedExpiry: tokens.expiresIn ? new Date(tokens.expiresIn * 1000).toISOString() : 'undefined',
        isExpired: tokens.expiresIn ? tokens.expiresIn < Math.floor(Date.now() / 1000) : 'unknown'
      });

      // Create the connect account DTO
      const connectAccountDto = {
        platform: profileData.platform === 'tiktok' ? PlatformType.TIKTOK : PlatformType.YOUTUBE,
        platformUserId: profileData.subjectId,
        platformUsername: profileData.username,
        platformDisplayName: profileData.displayName,
        platformProfilePicture: profileData.profilePicture,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenExpiry: tokens.expiresIn ? new Date(tokens.expiresIn * 1000).toISOString() : undefined,
        permissions: ['read', 'analytics', 'write'],
        // Include the platform data we already have
        platformData: profileData.platformData?.metrics || {
          followersCount: 0,
          followingCount: 0,
          totalViews: 0,
          totalLikes: 0,
          totalComments: 0,
          engagementRate: 0,
          postingFrequency: 0
        }
      };

      console.log(`[IdentitiesService] AccountConnect DTO created:`, {
        platform: connectAccountDto.platform,
        platformUserId: connectAccountDto.platformUserId,
        platformUsername: connectAccountDto.platformUsername,
        hasPlatformData: !!connectAccountDto.platformData,
        platformDataMetrics: connectAccountDto.platformData
      });

      // Create AccountConnect entry using the injected service
      console.log(`[IdentitiesService] Calling accountConnectService.connectAccount with:`, {
        userId,
        platform: connectAccountDto.platform,
        platformUserId: connectAccountDto.platformUserId
      });

      const result = await this.accountConnectService.connectAccount(userId, connectAccountDto);

      console.log(`[IdentitiesService] AccountConnect entry created successfully for user ${userId} on ${profileData.platform}`);
      console.log(`[IdentitiesService] AccountConnect result:`, {
        id: result.id,
        platform: result.platform,
        status: result.status
      });
    } catch (error) {
      console.error('[IdentitiesService] Failed to create AccountConnect entry:', error);
      console.error('[IdentitiesService] Error details:', {
        message: error.message,
        stack: error.stack,
        userId,
        platform: profileData.platform
      });
      // Don't throw - this is optional for now, but log the error
    }
  }

  /**
   * Get detailed YouTube profile using management token
   */
  private async getYouTubeManagementProfile(accessToken: string): Promise<any> {
    try {
      console.log('[IdentitiesService] Fetching YouTube channels with management token...');

      const response = await axios.get(
        'https://www.googleapis.com/youtube/v3/channels',
        {
          params: {
            part: 'snippet,statistics,contentDetails,brandingSettings',
            mine: true,
          },
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );

      console.log('[IdentitiesService] YouTube channels API response:', {
        totalResults: response.data.pageInfo?.totalResults || 0,
        itemsCount: response.data.items?.length || 0,
        hasItems: !!response.data.items,
        responseStatus: response.status,
        responseHeaders: Object.keys(response.headers || {})
      });

      // Validate API response structure
      if (!response.data) {
        throw new Error('Invalid YouTube API response: No data received');
      }

      if (!Array.isArray(response.data.items)) {
        console.warn('[IdentitiesService] YouTube API returned unexpected items structure:', typeof response.data.items);
        // Set items to empty array if it's not an array
        response.data.items = [];
      }

      const channel = response.data.items?.[0];
      if (!channel) {
        // Check if this is a permissions issue or if user simply doesn't have a channel
        console.log('[IdentitiesService] No YouTube channel found. This could mean:');
        console.log('1. User has not created a YouTube channel yet');
        console.log('2. OAuth token lacks proper permissions');
        console.log('3. User account does not have YouTube access');

        // Try to get basic user info to confirm the token works
        try {
          const userInfoResponse = await axios.get(
            'https://www.googleapis.com/oauth2/v2/userinfo',
            {
              headers: {
                'Authorization': `Bearer ${accessToken}`,
              },
            }
          );

          console.log('[IdentitiesService] OAuth token is valid, user info:', {
            id: userInfoResponse.data.id,
            email: userInfoResponse.data.email,
            name: userInfoResponse.data.name,
            verified_email: userInfoResponse.data.verified_email
          });

          // Validate user info response
          if (!userInfoResponse.data || !userInfoResponse.data.id) {
            throw new Error('Invalid user info response: Missing user ID');
          }

          // Create a minimal profile for users without YouTube channels
          return {
            subjectId: userInfoResponse.data.id,
            username: userInfoResponse.data.email?.split('@')[0] || 'youtube_user',
            displayName: userInfoResponse.data.name || 'YouTube User',
            email: userInfoResponse.data.email,
            profilePicture: userInfoResponse.data.picture,
            platformData: {
              hasChannel: false,
              channelId: null,
              subscriberCount: 0,
              videoCount: 0,
              viewCount: 0,
              customUrl: null,
              description: 'No YouTube channel created yet',
              publishedAt: null,
              country: null,
              defaultLanguage: null,
              thumbnails: null,
              uploadsPlaylistId: null,
              bannerExternalUrl: null
            }
          };
        } catch (userInfoError) {
          console.error('[IdentitiesService] Failed to fetch user info:', userInfoError.message);
          throw new Error('Invalid OAuth token or insufficient permissions for YouTube access');
        }
      }

      // Get videos to calculate real metrics
      let videos = [];
      let totalLikes = 0;
      let totalComments = 0;
      let engagementRate = 0;
      let postingFrequency = 0;

      try {
        // Fetch videos to calculate real metrics
        const videosResponse = await axios.get(
          'https://www.googleapis.com/youtube/v3/search',
          {
            params: {
              part: 'snippet',
              channelId: channel.id,
              type: 'video',
              order: 'date',
              maxResults: 50,
            },
            headers: {
              'Authorization': `Bearer ${accessToken}`,
            },
          }
        );

        if (videosResponse.data?.items) {
          videos = videosResponse.data.items;

          // Get detailed stats for each video
          for (const video of videos.slice(0, 10)) { // Limit to 10 for performance
            try {
              const videoStatsResponse = await axios.get(
                'https://www.googleapis.com/youtube/v3/videos',
                {
                  params: {
                    part: 'statistics,snippet',
                    id: video.id.videoId,
                  },
                  headers: {
                    'Authorization': `Bearer ${accessToken}`,
                  },
                }
              );

              if (videoStatsResponse.data?.items?.[0]) {
                const videoStats = videoStatsResponse.data.items[0];
                totalLikes += parseInt(videoStats.statistics?.likeCount || '0');
                totalComments += parseInt(videoStats.statistics?.commentCount || '0');
              }
            } catch (videoError) {
              console.log(`Could not fetch stats for video ${video.id.videoId}:`, videoError.message);
            }
          }

          // Calculate engagement rate using analytics service method
          const totalViews = parseInt(channel.statistics.viewCount) || 0;
          if (totalViews > 0) {
            engagementRate = this.analyticsService['calculateEngagementRate']({
              viewCount: totalViews,
              likeCount: totalLikes,
              commentCount: totalComments
            });
          }

          // Calculate posting frequency (videos per month)
          if (videos.length > 0) {
            const firstVideoDate = new Date(videos[0].snippet.publishedAt);
            const now = new Date();
            const monthsDiff = (now.getTime() - firstVideoDate.getTime()) / (1000 * 60 * 60 * 24 * 30);
            postingFrequency = monthsDiff > 0 ? Math.round((videos.length / monthsDiff) * 100) / 100 : videos.length;
          }
        }
      } catch (videoError) {
        console.log('Could not fetch videos for metrics calculation:', videoError.message);
        // Continue with basic profile data
      }

      // Return new flattened structure with tokens and metrics object
      return {
        // Profile fields at top level
        subjectId: channel.id,
        username: channel.snippet.customUrl?.replace('@', '') || channel.id,
        displayName: channel.snippet.title,
        profilePicture: channel.snippet.thumbnails?.high?.url,

        // Platform data with metrics object
        platformData: {
          metrics: {
            subscriberCount: parseInt(channel.statistics.subscriberCount) || 0,
            videoCount: parseInt(channel.statistics.videoCount) || 0,
            totalViews: parseInt(channel.statistics.viewCount) || 0,
            totalLikes: totalLikes,
            totalComments: totalComments,
            engagementRate: Math.round(engagementRate * 100) / 100,
            postingFrequency: postingFrequency
          },
          customUrl: channel.snippet.customUrl,
          description: channel.snippet.description,
          publishedAt: channel.snippet.publishedAt,
          country: channel.snippet.country,
          defaultLanguage: channel.snippet.defaultLanguage,
          thumbnails: channel.snippet.thumbnails,
          uploadsPlaylistId: channel.contentDetails?.relatedPlaylists?.uploads,
          bannerExternalUrl: channel.brandingSettings?.image?.bannerExternalUrl
        }
      };
    } catch (error) {
      console.error('Failed to fetch detailed YouTube profile:', error);
      throw new Error('Failed to fetch detailed YouTube profile');
    }
  }

  /**
   * Get LinkedIn OAuth URL for registration
   */
  getLinkedInAuthUrl(): { url: string } {
    const clientId = this.configService.get<string>("LINKEDIN_CLIENT_ID");
    const redirectUri = "http://localhost:3000/v2/identities/linkedin/callback";
    const scope = ["openid", "profile", "email"].join(" ");
    const state = Math.random().toString(36).substring(7);

    const url = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${clientId}&redirect_uri=${redirectUri}&state=${state}&scope=${scope}`;
    console.log('LinkedIn OAuth URL:', url);

    return { url };
  }

  /**
   * Handle LinkedIn OAuth callback for registration
   */
  async handleLinkedInCallback(code: string, state: string): Promise<{ accessToken: string; refreshToken: string }> {
    console.log(`[IdentitiesService] LinkedIn OAuth callback started`);
    try {
      // Exchange code for tokens using OAuth service
      console.log(`[IdentitiesService] Exchanging LinkedIn OAuth code for tokens...`);
      const tokens = await this.oauthService.exchangeCodeForIdentity('linkedin', code);
      console.log(`[IdentitiesService] LinkedIn tokens received successfully`);

      // Get profile from LinkedIn
      console.log(`[IdentitiesService] Fetching LinkedIn profile...`);
      const profile = await this.oauthService.getLinkedInProfile(tokens.accessToken);
      console.log(`[IdentitiesService] LinkedIn profile received for user: ${profile.username || profile.subjectId}`);

      // Create identity DTO
      const identityDto: CreateIdentityDto = {
        platform: IdentityPlatform.LINKEDIN,
        subjectId: profile.subjectId,
        username: profile.username,
        displayName: profile.displayName,
        email: profile.email,
        profilePicture: profile.profilePicture,
        platformData: profile.platformData,
      };

      // Register user with identity
      console.log(`[IdentitiesService] Processing LinkedIn registration/login...`);
      const result = await this.registerWithIdentity(identityDto);
      console.log(`[IdentitiesService] LinkedIn flow completed - isExistingUser: ${result.isExistingUser}`);

      return {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken
      };
    } catch (error) {
      console.error(`[IdentitiesService] LinkedIn OAuth callback failed:`, error);
      throw error;
    }
  }
}
