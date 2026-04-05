import { BadRequestException, Injectable, Logger, Inject, forwardRef } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { UsersService } from "../users/users.service";
import * as bcrypt from "bcryptjs";
import { MailerService } from "@nestjs-modules/mailer";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { ResetPasswordDto } from "./dto/ResetPassword.dto";
import { CreateUserDto } from "../users/dto/create-user.dto";
import { UserRole } from "../users/enum/user-role.enum";
import { BlacklistRepository } from "./auth.repository";
import { jwtConstants } from "./constants";
import { InternalServerErrorException } from "../common/exceptions/interrnal-server-error.exception";
import { ConflictException } from "../common/exceptions/conflict.exception";
import { UnauthorizedException } from "../common/exceptions/unauthorized.exception";
import axios from "axios";
import { ConfigService } from "@nestjs/config";
import { EmailService } from "../email/email.service";

import { RefreshTokenRepository } from "../auth/refresh-token.repository";
import { SocialAccountsService } from "../users/services/social-accounts.service";
import {
  TokenPair,
  TikTokTokenResponse,
} from "../common/interfaces/auth.interface";
import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly oauth2Client: OAuth2Client;
  private readonly YOUTUBE_SCOPES = [
    "https://www.googleapis.com/auth/youtube.upload",
    "https://www.googleapis.com/auth/youtube.readonly",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/userinfo.email",
    "openid",
    "email",
  ];

  constructor(
    @Inject(forwardRef(() => UsersService))
    private usersService: UsersService,
    private jwtService: JwtService,
    private mailerService: MailerService,
    private refreshTokenRepository: RefreshTokenRepository,
    private blacklistRepository: BlacklistRepository,
    private configService: ConfigService,
    private emailService: EmailService,
    private socialAccountsService: SocialAccountsService,
  ) {
    this.oauth2Client = new google.auth.OAuth2(
      this.configService.get("YOUTUBE_CLIENT_ID"),
      this.configService.get("YOUTUBE_CLIENT_SECRET"),
      this.configService.get("YOUTUBE_REDIRECT_URI"),
    );
  }

  public generateNumericCode(length: number = 6): string {
    let code = "";
    for (let i = 0; i < length; i++) {
      code += Math.floor(Math.random() * 10).toString();
    }
    return code;
  }

  private generateRandomPassword(length: number = 16): string {
    const chars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()";
    let password = "";
    for (let i = 0; i < length; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }

  async validateUser(email: string, password: string): Promise<any> {
    try {
      const user = await this.usersService.findByEmail(email);
      if (
        user &&
        (await bcrypt.compare(password, user.password)) &&
        user.isEmailVerified
      ) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { password, ...result } = user;
        return result;
      }
      return null;
    } catch (error) {
      console.error("Error validating user:", error);
      throw new InternalServerErrorException("User validation failed");
    }
  }

  /**
   * V2 Login method for users with identities (no socialAccounts)
   * This is the new way for v2 users
   */
  async loginV2(
    user: any,
    deviceInfo?: string,
    ipAddress?: string,
  ): Promise<TokenPair> {
    const userDoc =
      user._doc ||
      (typeof user.toObject === "function" ? user.toObject() : user);
    const { email, role, _id, authMethod, identities = [] } = userDoc;

    if (!email || !role || !_id) {
      console.error("Missing fields in user object for payload:", {
        email,
        role,
        _id,
      });
      throw new InternalServerErrorException(
        "Invalid user object during login",
      );
    }

    // Extract identity information (v2 format)
    const isDevelopment = process.env.NODE_ENV !== "production";
    const identitiesInfo = identities.map((identity: any) => ({
      platform: identity.platform,
      subjectId: identity.subjectId,
      username: identity.username,
      displayName: identity.displayName,
      email: identity.email,
      profilePicture: identity.profilePicture,
      platformData: identity.platformData,
      linkedAt: identity.linkedAt,
      isActive: identity.isActive,
      // Note: No tokens in v2 identities - tokens are handled in Account-Connect
    }));

    // Prepare the payload with user info and identities
    const payload = {
      email,
      role,
      sub: _id,
      authMethod,
      identities: identitiesInfo, // v2 format
      deviceInfo: deviceInfo || "Unknown Device",
      ipAddress: ipAddress || "Unknown IP",
      lastLoginAt: new Date(),
      // Include any additional user data
      ...(userDoc.name && { name: userDoc.name }),
      ...(userDoc.avatar && { avatar: userDoc.avatar }),
    };

    if (!this.jwtService) {
      console.error("JwtService is not initialized");
      throw new InternalServerErrorException("JWT service not available");
    }

    const accessToken = this.jwtService.sign(payload, {
      secret: jwtConstants.secret,
      expiresIn: "24h",
    });

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 365); // 365 days

    const refreshToken = this.jwtService.sign(payload, {
      secret: jwtConstants.secret,
      expiresIn: "365d",
    });

    await this.refreshTokenRepository.create({
      userId: _id,
      token: refreshToken,
      expiresAt,
      deviceInfo,
      ipAddress,
    });

    return {
      accessToken,
      refreshToken,
      expires_in: "24h",
      user: {
        id: _id,
        email,
        role,
        name: userDoc.name,
        avatar: userDoc.avatar,
        identities: identitiesInfo,
      },
      deviceInfo,
      IpAddress: ipAddress,
    };
  }

  /**
   * Legacy login method for users with socialAccounts
   * @deprecated Use loginV2 for new users
   */
  async login(
    user: any,
    deviceInfo?: string,
    ipAddress?: string,
  ): Promise<TokenPair> {
    const userDoc =
      user._doc ||
      (typeof user.toObject === "function" ? user.toObject() : user);
    const { email, role, _id, authMethod, socialAccounts = [] } = userDoc;

    if (!email || !role || !_id) {
      console.error("Missing fields in user object for payload:", {
        email,
        role,
        _id,
      });
      throw new InternalServerErrorException(
        "Invalid user object during login",
      );
    }

    // Extract social account information
    const isDevelopment = process.env.NODE_ENV !== "production";
    const socialAccountsInfo = socialAccounts.map((account) => {
      const accountInfo: any = {
        platform: account.platform,
        accountId: account.accountId,
        profile: account.profile,
      };

      // Include tokens in development for testing
      if (isDevelopment) {
        accountInfo.accessToken = account.accessToken;
        accountInfo.refreshToken = account.refreshToken;
        accountInfo.expiresAt = account.expiresAt;
      }

      return accountInfo;
    });

    // Prepare the payload with user info and social accounts
    const payload = {
      email,
      role,
      sub: _id,
      authMethod,
      socialAccounts: socialAccountsInfo,
      deviceInfo: deviceInfo || "Unknown Device",
      ipAddress: ipAddress || "Unknown IP",
      lastLoginAt: new Date(),
      // Include any additional user data
      ...(userDoc.name && { name: userDoc.name }),
      ...(userDoc.avatar && { avatar: userDoc.avatar }),
    };

    if (!this.jwtService) {
      console.error("JwtService is not initialized");
      throw new InternalServerErrorException("JWT service not available");
    }

    const accessToken = this.jwtService.sign(payload, {
      secret: jwtConstants.secret,
      expiresIn: "24h",
    });

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 365); // 365 days

    const refreshToken = this.jwtService.sign(payload, {
      secret: jwtConstants.secret,
      expiresIn: "365d",
    });

    await this.refreshTokenRepository.create({
      userId: _id,
      token: refreshToken,
      expiresAt,
      deviceInfo,
      ipAddress,
    });

    await this.usersService.update(_id, {
      lastLoginAt: new Date(),
      lastLoginIp: ipAddress,
    });

    console.log("User logged in successfully.");

    const cleanUserData = user._doc || user.toObject();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, resetToken, confirmationToken, ...safeUserData } =
      cleanUserData;

    return {
      accessToken,
      refreshToken,
      expires_in: "24h",
      user: safeUserData,
      deviceInfo: deviceInfo || "Unknown Device",
    };
  }

  /**
   * Checks if a given JWT access token is expiring soon (within the next X minutes).
   * @param token JWT access token
   * @param thresholdMinutes Number of minutes before expiry to consider as "expiring soon" (default: 5)
   * @returns true if expiring soon, false otherwise
   */
  async isTokenExpiringSoon(
    token: string,
    thresholdMinutes = 5,
  ): Promise<boolean> {
    try {
      const decoded: any = this.jwtService.decode(token);
      if (!decoded || !decoded.exp) {
        throw new UnauthorizedException("Invalid token");
      }
      const expiry = decoded.exp * 1000;
      const now = Date.now();
      const thresholdMs = thresholdMinutes * 60 * 1000;
      return expiry - now <= thresholdMs;
    } catch (error) {
      console.error("Error checking token expiry:", error);
      throw new UnauthorizedException("Failed to check token expiry");
    }
  }

  async validateUserByToken(token: string): Promise<any> {
    try {
      if (!this.jwtService) {
        console.error("JwtService is not initialized in validateUserByToken");
        throw new UnauthorizedException("JWT service not available");
      }
      const payload = this.jwtService.verify(token, {
        secret: jwtConstants.secret,
      });
      const user = await this.usersService.findById(payload.sub);

      if (!user) {
        throw new UnauthorizedException("User not found");
      }

      const userObject = user.toObject ? user.toObject() : user;

      console.log("User object returned by validateUserByToken:", userObject);
      return userObject;
    } catch (error) {
      console.error("Error validating user by token:", error);
      throw new UnauthorizedException("Invalid token");
    }
  }

  async refreshAccessToken(
    refreshToken: string,
    deviceInfo?: string,
    ipAddress?: string,
  ): Promise<TokenPair> {
    try {
      const tokenRecord =
        await this.refreshTokenRepository.findByToken(refreshToken);

      if (!tokenRecord) {
        throw new UnauthorizedException("Invalid refresh token");
      }

      const user = await this.usersService.findById(tokenRecord.userId);
      if (!user) {
        throw new UnauthorizedException("User not found");
      }

      await this.refreshTokenRepository.revokeToken(refreshToken);

      // new token pair
      return await this.login(user, deviceInfo, ipAddress);
    } catch (error) {
      console.error("Error refreshing token:", error);
      throw new UnauthorizedException("Token refresh failed");
    }
  }

  async getUserFromTikTokToken(token: string): Promise<any> {
    try {
      // const payload = this.jwtService.verify(token, { secret: jwtConstants.secret });
      const user = await this.usersService.findByTiktokAccesstoken(token);
      if (!user) {
        throw new UnauthorizedException("User not found");
      }
      return user;
    } catch (error) {
      console.error("Error validating user by token:", error);
      throw new UnauthorizedException("Invalid token");
    }
  }

  async getUserFromLinkedInToken(token: string): Promise<any> {
    try {
      // const payload = this.jwtService.verify(token, { secret: jwtConstants.secret });
      const user = await this.usersService.findByLinkedinAccesstoken(token);
      if (!user) {
        throw new UnauthorizedException("User not found");
      }
      return user;
    } catch (error) {
      console.error("Error validating user by token:", error);
      throw new UnauthorizedException("Invalid token");
    }
  }

  async register(email: string, password: string, role: string) {
    try {
      // SECURITY FIX: Check if user exists FIRST before sending email
      const existingUser = await this.usersService.findByEmail(email);
      if (existingUser) {
        this.logger.warn(`Registration attempt with existing email: ${email}`);
        throw new ConflictException("Email already exists");
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const confirmationCode = this.generateNumericCode(8);

      // Create the user FIRST
      const createUserDto: CreateUserDto = {
        email,
        password: hashedPassword,
        role: role as UserRole,
        confirmationToken: confirmationCode,
        isEmailVerified: false,
      };

      const user = await this.usersService.create(createUserDto);
      this.logger.log(`User created successfully: ${user._id}`);

      // Only send email AFTER user is created successfully
      try {
        await this.emailService.sendConfirmationEmail(email, confirmationCode);
        this.logger.log(`Confirmation email sent to: ${email}`);
      } catch (emailError) {
        this.logger.error(
          `Failed to send confirmation email to ${email}:`,
          emailError,
        );

        // Check if it's a SendGrid credit/authentication issue
        if (emailError.code === 401) {
          throw new InternalServerErrorException(
            "Email service temporarily unavailable. Please try again later or contact support.",
          );
        }

        throw new InternalServerErrorException(
          "Failed to send confirmation email. Please try again.",
        );
      }

      return {
        message:
          "Registration successful. Please check your email for confirmation.",
      };
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error; // Re-throw the conflict error
      }
      if (error instanceof InternalServerErrorException) {
        throw error; // Re-throw the email error
      }
      this.logger.error("Error registering user:", error);
      throw new InternalServerErrorException("User registration failed");
    }
  }

      async confirmEmail(token: string, email: string) {
    try {
      if (!email) {
        throw new BadRequestException("Email is required for confirmation");
      }

      const user = await this.usersService.findByConfirmationToken(token);
      console.log("User object after confirming email:", user);

      if (!user) {
        throw new UnauthorizedException("Invalid confirmation token");
      }

      // SECURITY: Email must match exactly (case-insensitive)
      if (user.email.toLowerCase() !== email.toLowerCase()) {
        throw new BadRequestException("Email mismatch");
      }

      // Check if email is already verified
      if (user.isEmailVerified) {
        // If already verified, just clear the token and return success
        if (user.confirmationToken) {
          user.confirmationToken = undefined;
          await this.usersService.update(user._id as string, user);
        }
        return { message: "Email is already verified." };
      }

      // Clear the token FIRST to prevent reuse
      user.confirmationToken = undefined;
      user.isEmailVerified = true;
      await this.usersService.update(user._id as string, user);
      console.log("user object after updating:", user);
      return { message: "Email confirmed successfully." };
    } catch (error) {
      console.error("Error confirming email:", error);
      if (error instanceof UnauthorizedException || error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException("Email confirmation failed");
    }
  }

  async forgotPassword(forgotPasswordDto: ForgotPasswordDto) {
    try {
      const user = await this.usersService.findByEmail(forgotPasswordDto.email);
      if (!user) {
        throw new UnauthorizedException("User not found");
      }

      const resetCode = this.generateNumericCode();
      const resetTokenExpires = new Date(Date.now() + 60000 * 30); // 30 mins

      // add plus 3gmt
      const timeZoneOffset = 3 * 60 * 60 * 1000;
      resetTokenExpires.setTime(resetTokenExpires.getTime() + timeZoneOffset);

      console.log("Reset token expires:", resetTokenExpires);
      user.resetToken = resetCode;
      user.resetTokenExpires = resetTokenExpires;
      await this.usersService.update(user._id as string, user);

      // First, try to send the password reset email
      try {
        console.log(
          `Attempting to send password reset email to: ${forgotPasswordDto.email}`,
        );
        console.log(`Reset code generated: ${resetCode}`);

        // Check email service availability
        const emailStatus = this.emailService.getEmailProviderStatus();
        console.log("Email service status:", emailStatus);

        await this.emailService.sendPasswordResetEmail(
          forgotPasswordDto.email,
          resetCode,
        );

        console.log("Password reset email sent successfully");
      } catch (emailError) {
        this.logger.error(
          `Failed to send password reset email to ${forgotPasswordDto.email}:`,
          emailError,
        );

        // Check if it's a SendGrid credit/authentication issue
        if (emailError.code === 401) {
          throw new InternalServerErrorException(
            "Email service temporarily unavailable. Please try again later or contact support.",
          );
        }

        throw new InternalServerErrorException(
          "Failed to send password reset email. Please try again.",
        );
      }

      return { message: "Password reset email sent to your email" };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error; // Re-throw user not found error
      }
      if (error instanceof InternalServerErrorException) {
        throw error; // Re-throw email error
      }
      console.error("Error in forgot password:", error);
      throw new InternalServerErrorException("Password reset request failed");
    }
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    try {
      console.log(
        `Attempting to reset password for token: ${resetPasswordDto.token}`,
      );

      const user = await this.usersService.findByResetToken(
        resetPasswordDto.token,
      );

      if (!user) {
        console.log("User not found for reset token:", resetPasswordDto.token);
        throw new UnauthorizedException("Invalid or expired reset token");
      }

      console.log(`Found user: ${user.email} (ID: ${user._id})`);

      if (user.resetTokenExpires < new Date()) {
        console.log("Reset token has expired:", resetPasswordDto.token);
        throw new UnauthorizedException("Invalid or expired reset token");
      }

      console.log("Token is valid, proceeding with password reset");

      const hashedPassword = await bcrypt.hash(
        resetPasswordDto.newPassword,
        10,
      );

      console.log("Password hashed successfully");
      console.log(
        `Old password hash: ${
          user.password ? user.password.substring(0, 20) + "..." : "null"
        }`,
      );
      console.log(`New password hash: ${hashedPassword.substring(0, 20)}...`);

      // Create update object with only the fields we want to update
      const updateData = {
        password: hashedPassword,
        resetToken: undefined,
        resetTokenExpires: undefined,
      };

      console.log("Updating user with data:", updateData);

      const updatedUser = await this.usersService.update(
        user._id as string,
        updateData,
      );

      console.log("User updated successfully");
      console.log(
        `Updated user password hash: ${
          updatedUser.password
            ? updatedUser.password.substring(0, 20) + "..."
            : "null"
        }`,
      );

      await this.emailService.sendPasswordChangedEmail(user.email);

      return { message: "Password reset successfully" };
    } catch (error) {
      console.error("Error resetting password:", error);
      throw new InternalServerErrorException("Password reset failed");
    }
  }

  async logout(userId: string) {
    try {
      const user = await this.usersService.findById(userId);
      if (!user) {
        throw new UnauthorizedException("User not found");
      }
      const token = this.jwtService.sign(
        { email: user.email, sub: user._id, role: user.role },
        { secret: jwtConstants.secret },
      );
      await this.blacklistRepository.addTokenToBlacklist(token);

      //console.log("Remove LinkedIn access token")
      if (user.linkedInAccessToken) {
        user.linkedInAccessToken = undefined;
        await this.usersService.update(userId, user);
      }
      return { message: "Logout successful" };
    } catch (error) {
      console.error("Error logging out:", error);
      throw new InternalServerErrorException("Logout failed");
    }
  }

  async isTokenBlacklisted(token: string): Promise<boolean> {
    return this.blacklistRepository.isTokenBlacklisted(token);
  }

  // Public methods for email service debugging
  getEmailServiceStatus() {
    return this.emailService.getEmailProviderStatus();
  }

  isEmailServiceAvailable() {
    return this.emailService.isEmailServiceAvailable();
  }

  async testEmailSending(email: string) {
    const testCode = "12345678";
    await this.emailService.sendPasswordResetEmail(email, testCode);
    return { message: "Test email sent successfully", email, code: testCode };
  }

  async debugUserPassword(email: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new Error("User not found");
    }

    return {
      email: user.email,
      hasPassword: !!user.password,
      passwordLength: user.password ? user.password.length : 0,
      passwordHash: user.password
        ? user.password.substring(0, 20) + "..."
        : null,
      isEmailVerified: user.isEmailVerified,
      resetToken: user.resetToken,
      resetTokenExpires: user.resetTokenExpires,
    };
  }

  async refreshTikTokAccessToken(
    refreshToken: string,
  ): Promise<TikTokTokenResponse> {
    try {
      const clientKey = this.configService.get<string>("TIKTOK_CLIENT_KEY");
      const clientSecret = this.configService.get<string>(
        "TIKTOK_CLIENT_SECRET",
      );

      const response = await axios.post(
        "https://open.tiktokapis.com/v2/oauth/token/",
        new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
          client_key: clientKey,
          client_secret: clientSecret,
        }),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        },
      );

      return response.data;
    } catch (error) {
      console.error("Error refreshing TikTok token:", error);
      throw new InternalServerErrorException("Failed to refresh TikTok token");
    }
  }

  async exchangeCodeForAccessToken(code: string): Promise<string> {
    try {
      const clientId = this.configService.get<string>("LINKEDIN_CLIENT_ID");
      const clientSecret = this.configService.get<string>(
        "LINKEDIN_CLIENT_SECRET",
      );
      // console.log("1. Client ID", clientId ," 2.Client Secret", clientSecret)
      const response = await axios.post(
        "https://www.linkedin.com/oauth/v2/accessToken",
        null,
        {
          params: {
            grant_type: "authorization_code",
            code: code,
            redirect_uri: "http://localhost:3000/auth/linkedin/callback",
            client_id: clientId,
            client_secret: clientSecret,
          },
        },
      );
      console.log("LinkedIn access token response:", response.data);
      const access_token = response?.data?.access_token;
      return access_token;
    } catch (error) {
      console.error("Error exchanging code for access token:", error);
      throw new InternalServerErrorException(
        "Failed to exchange code for access token",
      );
    }
  }

  async updateUserLinkedIn(email: string, linkedInAccessToken: string) {
    try {
      const user = await this.usersService.findByEmail(email);
      if (!user) {
        throw new UnauthorizedException("User not found");
      }

      // Update user with LinkedIn information
      const updateData = {
        linkedInAccessToken,
        authMethod: user.authMethod
          ? user.authMethod.includes("linkedin")
            ? user.authMethod
            : user.authMethod + ",linkedin"
          : "linkedin",
      };

      await this.usersService.update(user._id as string, updateData);
      return true;
    } catch (error) {
      console.error("Error updating user with LinkedIn info:", error);
      throw new InternalServerErrorException(
        "Failed to update user with LinkedIn information",
      );
    }
  }

  async connectLinkedInToExistingUser(
    userId: string,
    linkedInAccessToken: string,
  ) {
    try {
      const user = await this.usersService.findById(userId);
      if (user) {
        user.linkedInAccessToken = linkedInAccessToken;
        user.authMethod = user.authMethod
          ? user.authMethod + ",linkedin"
          : "linkedin";
        await this.usersService.update(userId, user);
        return {
          message: "LinkedIn account connected to existing user successfully.",
        };
      }
      throw new UnauthorizedException("User not found");
    } catch (error) {
      console.error(
        "Error connecting LinkedIn account to existing user:",
        error.message,
      );
      throw new InternalServerErrorException(
        "LinkedIn account connection failed",
      );
    }
  }

  async getLinkedInOrganizationUrn(accessToken: string): Promise<string> {
    try {
      const response = await axios.get(
        "https://api.linkedin.com/v2/organizationAcls?q=roleAssignee&role=ADMINISTRATOR",
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );
      const orgurn = response.data.elements[0].organization;
      console.log("Organization URN", orgurn);
      return orgurn;
    } catch (error) {
      console.error("Error fetching LinkedIn organization URN:", error);
      throw new InternalServerErrorException(
        "Failed to fetch LinkedIn organization URN",
      );
    }
  }

  async getLinkedInProfile(accessToken: string): Promise<any> {
    console.log("Fetching LinkedIn profile...");
    try {
      const basicProfile = await this.fetchBasicLinkedInProfile(accessToken);
      const organizationUrn = await this.getLinkedInOrganizationUrn(
        accessToken,
      ).catch((error) => {
        console.log("No organization URN found:", error.message);
        return null;
      });

      console.log("Organization URN:", organizationUrn);

      const companyPages = organizationUrn
        ? await this.getLinkedInCompanyPages(
            accessToken,
            organizationUrn,
          ).catch((error) => {
            console.log("No company pages found:", error.message);
            return [];
          })
        : [];

      return {
        ...basicProfile,
        organizationUrn,
        companyPages,
      };
    } catch (error) {
      console.error(
        "Error fetching LinkedIn profile:",
        error.response?.data || error.message,
      );
      throw new InternalServerErrorException(
        `Failed to fetch LinkedIn profile: ${error.message}`,
      );
    }
  }

  private async fetchBasicLinkedInProfile(accessToken: string): Promise<any> {
    const response = await axios.get("https://api.linkedin.com/v2/userinfo", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    return response.data;
  }

  async connectOrRegisterLinkedIn(state: string, linkedInAccessToken: string) {
    try {
      const profile = await this.getLinkedInProfile(linkedInAccessToken);
      const email = profile.email;

      if (!email) {
        throw new UnauthorizedException("Email not provided by LinkedIn");
      }

      // Prepare social account data with proper typing
      const socialAccountData = {
        platform: "linkedin" as const,
        accountId: profile.sub,
        accessToken: linkedInAccessToken,
        isConnected: true,
        lastSyncedAt: new Date(),
        profile: {
          username: profile.name,
          displayName: profile.name,
          email: profile.email,
          profilePicture: profile.picture,
        },
        data: {
          organizationUrn: profile.organizationUrn,
          companyPages: profile.companyPages || [],
          givenName: profile.given_name,
          familyName: profile.family_name,
        },
      };

      console.log(
        "Prepared LinkedIn social account data:",
        JSON.stringify(socialAccountData, null, 2),
      );

      const updateData: any = {
        name: profile.name,
        avatar: profile.picture,
        authMethod: "linkedin",
      };

      let user = await this.usersService.findByEmail(email);

      if (user) {
        // Update existing user
        user = await this.usersService.update(user._id as string, updateData);
        await this.socialAccountsService.addSocialAccount(
          user._id.toString(),
          socialAccountData,
        );
        // Refresh user to get the updated social accounts
        user = await this.usersService.findById(user._id.toString());
        const accessToken = await this.login(user);
        return {
          message: "User logged in successfully.",
          accessToken,
          hasLinkedInPages: profile.companyPages?.length > 0,
        };
      } else {
        // Create new user
        const createUserDto: any = {
          ...updateData,
          email: profile.email,
          isEmailVerified: true,
          password: await bcrypt.hash("default_password", 10),
          socialAccounts: [socialAccountData],
        };

        user = await this.usersService.create(createUserDto);
        const accessToken = await this.login(user);

        return {
          message: "LinkedIn account registered and connected successfully.",
          accessToken,
          hasLinkedInPages: profile.companyPages?.length > 0,
        };
      }
    } catch (error) {
      console.error("Error connecting or registering LinkedIn account:", error);
      throw new InternalServerErrorException(
        "LinkedIn account connection or registration failed",
      );
    }
  }

  async getLinkedInCompanyPages(
    accessToken: string,
    organizationUrn: string,
  ): Promise<any[]> {
    try {
      const response = await axios.get(
        `https://api.linkedin.com/v2/organizationalEntityAcls?q=roleAssignee&role=ADMINISTRATOR&organization=${organizationUrn}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      console.log("LinkedIn company pages response:", response.data);

      if (!response.data.elements || response.data.elements.length === 0) {
        return [];
      }

      return response.data.elements.map((company) => ({
        pageId: company.organizationalTarget,
        pageName: company.organizationalTargetName,
        accessToken: accessToken,
      }));
    } catch (error) {
      console.error(
        "Error fetching LinkedIn company pages:",
        error.response?.data || error.message,
      );
      return [];
    }
  }

  async exchangeCodeForTikTokAccessToken(
    code: string,
  ): Promise<TikTokTokenResponse> {
    try {
      const clientKey = this.configService.get<string>("TIKTOK_CLIENT_KEY");
      const clientSecret = this.configService.get<string>(
        "TIKTOK_CLIENT_SECRET",
      );
      const redirectUri =
        this.configService.get<string>("TIKTOK_REDIRECT_URI") ||
        "https://uat.groreels.com/auth/tiktok/callback";
      console.log("exchangeCodeForTikTokAccessToken started ");
      const response = await axios.post(
        "https://open.tiktokapis.com/v2/oauth/token/",
        new URLSearchParams({
          grant_type: "authorization_code",
          code: code,
          redirect_uri: redirectUri,
          client_key: clientKey,
          client_secret: clientSecret,
        }),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        },
      );
      console.log("Exchange of access token ended");
      return response.data as TikTokTokenResponse;
    } catch (error) {
      console.error("Error exchanging code for TikTok access token:", error);
      throw new InternalServerErrorException(
        "Failed to exchange code for TikTok access token",
      );
    }
  }

  async getTikTokProfile(accessToken: string): Promise<any> {
    try {
      const response = await axios.get(
        "https://open.tiktokapis.com/v2/user/info/",
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          params: {
            fields: [
              "open_id",
              "union_id",
              "display_name",
              "avatar_url",
              "avatar_url_100",
              "avatar_large_url",
              "profile_deep_link",
            ].join(","),
          },
        },
      );

      console.log("TikTok profile response:", response.data);
      const data = response.data;

      if (!data.data?.user) {
        console.error("Invalid TikTok profile response:", data);
        throw new Error("Invalid profile response structure");
      }

      return data;
    } catch (error) {
      console.error(
        "Error fetching TikTok profile:",
        error.response?.data || error,
      );
      throw new InternalServerErrorException(
        `Failed to fetch TikTok profile: ${error.response?.data?.error?.message || error.message}`,
      );
    }
  }

  async connectOrRegisterTikTok(
    state: string,
    accessToken: string,
    refresh_token: string,
    accessTokenExpiry: string,
    refreshTokenExpiry: string,
    deviceInfo?: string,
    ipAddress?: string,
  ) {
    try {
      const profile = await this.getTikTokProfile(accessToken);

      if (!profile.data?.user) {
        throw new Error("Invalid TikTok profile response");
      }

      const tiktokUser = profile.data.user;

      // Prepare social account data with proper typing
      const socialAccountData = {
        platform: "tiktok" as const,
        accountId: tiktokUser.open_id,
        accessToken: accessToken,
        refreshToken: refresh_token,
        expiresAt: accessTokenExpiry
          ? Math.floor(Date.now() / 1000) + parseInt(accessTokenExpiry)
          : undefined,
        isConnected: true,
        lastSyncedAt: new Date(),
        profile: {
          username: tiktokUser.display_name,
          displayName: tiktokUser.display_name,
          email: `tiktok_${tiktokUser.open_id}@placeholder.com`,
          profilePicture: tiktokUser.avatar_url,
        },
        data: {
          openId: tiktokUser.open_id,
          unionId: tiktokUser.union_id,
          profileLink: tiktokUser.profile_deep_link,
          refreshTokenExpiry: refreshTokenExpiry,
        },
      };

      console.log(
        "Prepared TikTok social account data:",
        JSON.stringify(socialAccountData, null, 2),
      );

      const updateData: any = {
        name: tiktokUser.display_name,
        avatar: tiktokUser.avatar_url,
        authMethod: "tiktok",
      };

      let user = await this.usersService.findByTiktokId(tiktokUser.open_id);

      if (user) {
        user = await this.usersService.update(user._id as string, updateData);
        await this.socialAccountsService.addSocialAccount(
          user._id.toString(),
          socialAccountData,
        );
        // Refresh user to get the updated social accounts
        user = await this.usersService.findById(user._id.toString());
      } else {
        const createUserDto: any = {
          ...updateData,
          isEmailVerified: true,
          role: UserRole.AGENCY_ADMIN,
          email: `tiktok_${tiktokUser.open_id}@placeholder.com`,
          password: await bcrypt.hash("default_password", 10),
          socialAccounts: [socialAccountData],
        };

        try {
          user = await this.usersService.create(createUserDto);
        } catch (createError) {
          if (createError.code === 11000) {
            const createUserDtoRetry = {
              ...createUserDto,
              email: `tiktok_${tiktokUser.open_id}_${Date.now()}@placeholder.com`,
            };
            user = await this.usersService.create(createUserDtoRetry);
          } else {
            throw createError;
          }
        }
      }

      const tokenPair = await this.login(user, deviceInfo, ipAddress);

      return {
        message: "TikTok account connected successfully",
        user,
        ...tokenPair,
        tiktokStatus: { connected: true },
      };
    } catch (error) {
      console.error("Error in connectOrRegisterTikTok:", error);
      throw new Error(`Failed to connect TikTok account: ${error.message}`);
    }
  }

  async refreshExpiringTikTokTokens(): Promise<void> {
    try {
      // Find users with TikTok tokens expiring in the next 2 hours
      const twohoursfromNow = new Date(Date.now() + 2 * 60 * 60 * 1000);
      const users =
        await this.usersService.findUsersWithExpiringTikTokTokens(
          twohoursfromNow,
        );

      if (users.length === 0) {
        console.log("No TikTok tokens expiring in the next 2 hours.");
        return;
      }

      console.log(
        `Found ${users.length} users with TikTok tokens expiring in the next 2 hours.`,
      );

      for (const user of users) {
        try {
          console.log(
            `Refreshing TikTok tokens for user: ${user.email} (${user._id})`,
          );

          // Find TikTok social account
          const tiktokAccount = user.socialAccounts?.find(
            (acc) => acc.platform === "tiktok",
          );

          if (!tiktokAccount || !tiktokAccount.refreshToken) {
            console.error(
              `No TikTok refresh token found for user: ${user.email}`,
            );
            continue;
          }

          const newTokens = await this.refreshTikTokAccessToken(
            tiktokAccount.refreshToken,
          );

          // Update the social account with new tokens
          await this.socialAccountsService.updateSocialAccount(
            user._id.toString(),
            "tiktok",
            tiktokAccount.accountId,
            {
              accessToken: newTokens.access_token,
              refreshToken: newTokens.refresh_token,
              expiresAt: newTokens.expires_in
                ? Math.floor(Date.now() / 1000) + newTokens.expires_in
                : undefined,
              data: {
                ...tiktokAccount.data,
                refreshTokenExpiry: newTokens.refresh_expires_in?.toString(),
              },
            },
          );

          console.log(
            `Successfully refreshed TikTok tokens for user: ${user.email}`,
          );
        } catch (error) {
          console.error(
            `Failed to refresh TikTok tokens for user ${user.email}:`,
            error.message,
          );
        }
      }
    } catch (error) {
      console.error("Error refreshing TikTok tokens:", error.message);
      throw new InternalServerErrorException("Failed to refresh TikTok tokens");
    }
  }

  async exchangeCodeForYouTubeAccessToken(code: string): Promise<any> {
    try {
      const { tokens } = await this.oauth2Client.getToken(code);

      if (!tokens.access_token) {
        throw new Error("No access token received");
      }

      this.oauth2Client.setCredentials(tokens);

      // Get user profile from YouTube
      const oauth2 = google.oauth2({
        auth: this.oauth2Client,
        version: "v2",
      });

      const profile = await oauth2.userinfo.get();
      console.log(
        "Google profile data:",
        JSON.stringify(profile.data, null, 2),
      );

      if (!profile.data.email) {
        throw new Error("No email provided by Google");
      }

      // Find or create user
      let user = await this.usersService.findByEmail(profile.data.email);

      // Prepare social account data with proper typing
      const socialAccountData = {
        platform: "youtube" as const,
        accountId: profile.data.id,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: tokens.expiry_date
          ? Math.floor(tokens.expiry_date / 1000)
          : undefined,
        isConnected: true,
        lastSyncedAt: new Date(),
        profile: {
          username: profile.data.name,
          displayName: profile.data.name,
          email: profile.data.email,
          profilePicture: profile.data.picture,
        },
      };

      console.log(
        "Prepared social account data:",
        JSON.stringify(socialAccountData, null, 2),
      );

      const updateData: any = {
        name: profile.data.name,
        avatar: profile.data.picture,
        authMethod: user?.authMethod?.includes("youtube")
          ? user.authMethod
          : `${user?.authMethod || ""},youtube`.replace(/^,/, ""),
      };

      if (user) {
        user = await this.usersService.update(user._id as string, updateData);
        await this.socialAccountsService.addSocialAccount(
          user._id.toString(),
          socialAccountData,
        );
        // Refresh user to get the updated social accounts
        user = await this.usersService.findById(user._id.toString());
      } else {
        const createUserDto: any = {
          ...updateData,
          email: profile.data.email,
          isEmailVerified: true,
          role: UserRole.AGENCY_ADMIN,
          password: await bcrypt.hash("default_password", 10),
          socialAccounts: [socialAccountData],
        };

        try {
          user = await this.usersService.create(createUserDto);
        } catch (createError) {
          if (createError.code === 11000) {
            // If email already exists, try to update
            user = await this.usersService.findByEmail(profile.data.email);
            if (user) {
              user = await this.usersService.update(
                user._id as string,
                updateData,
              );
              // Add or update social account
              await this.socialAccountsService.addSocialAccount(
                user._id.toString(),
                socialAccountData,
              );
            } else {
              throw createError;
            }
          } else {
            throw createError;
          }
        }
      }

      const tokenPair = await this.login(user);

      return {
        ...tokenPair,
        youtubeTokens: {
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiresIn: tokens.expiry_date,
        },
        profile: profile.data,
      };
    } catch (error) {
      console.error("Error exchanging code for YouTube access token:", error);
      throw new InternalServerErrorException(
        "Failed to exchange code for YouTube access token",
      );
    }
  }

  async refreshYouTubeAccessToken(userId: string): Promise<string> {
    try {
      const user = await this.usersService.findById(userId);
      if (!user) {
        throw new UnauthorizedException("User not found");
      }

      // Find YouTube social account
      const youtubeAccount = user.socialAccounts?.find(
        (acc) => acc.platform === "youtube",
      );

      if (!youtubeAccount || !youtubeAccount.refreshToken) {
        throw new Error("No YouTube refresh token available");
      }

      this.oauth2Client.setCredentials({
        refresh_token: youtubeAccount.refreshToken,
      });

      const { credentials } = await this.oauth2Client.refreshAccessToken();

      // Update the social account with new tokens
      await this.socialAccountsService.updateSocialAccount(
        userId,
        "youtube",
        youtubeAccount.accountId,
        {
          accessToken: credentials.access_token,
          refreshToken:
            credentials.refresh_token || youtubeAccount.refreshToken,
          expiresAt: credentials.expiry_date
            ? Math.floor(credentials.expiry_date / 1000)
            : undefined,
        },
      );

      return credentials.access_token;
    } catch (error) {
      console.error("Failed to refresh YouTube access token:", error);
      throw new InternalServerErrorException("Failed to refresh YouTube token");
    }
  }

  async validateYouTubeAccessToken(userId: string): Promise<boolean> {
    try {
      const user = await this.usersService.findById(userId);
      if (!user || !user.youtubeAccessToken) {
        return false;
      }

      this.oauth2Client.setCredentials({
        access_token: user.youtubeAccessToken,
      });

      const oauth2 = google.oauth2({
        auth: this.oauth2Client,
        version: "v2",
      });

      await oauth2.userinfo.get();
      return true;
    } catch (error) {
      console.error("Failed to validate YouTube access token:", error);
      return false;
    }
  }

  async getYouTubeProfile(accessToken: string): Promise<any> {
    try {
      this.oauth2Client.setCredentials({
        access_token: accessToken,
      });

      const oauth2 = google.oauth2({
        auth: this.oauth2Client,
        version: "v2",
      });

      const profile = await oauth2.userinfo.get();
      return profile.data;
    } catch (error) {
      console.error("Error fetching YouTube profile:", error);
      throw new InternalServerErrorException("Failed to fetch YouTube profile");
    }
  }

  async getValidYouTubeAccessToken(userId: string): Promise<string> {
    const user = await this.usersService.findById(userId);
    if (!user) throw new BadRequestException("User not found");

    // Find YouTube social account
    const youtubeAccount = user.socialAccounts?.find(
      (acc) => acc.platform === "youtube",
    );

    if (!youtubeAccount) {
      throw new BadRequestException("No YouTube account found");
    }

    // Check if accountId exists
    if (!youtubeAccount.accountId) {
      throw new BadRequestException("YouTube account ID is missing");
    }

    // Check if token is expired
    const now = Math.floor(Date.now() / 1000); // Current time in seconds
    if (youtubeAccount.expiresAt && youtubeAccount.expiresAt > now) {
      return youtubeAccount.accessToken;
    }

    // Token is expired, refresh it
    if (!youtubeAccount.refreshToken) {
      throw new BadRequestException("No refresh token");
    }

    try {
      this.oauth2Client.setCredentials({
        refresh_token: youtubeAccount.refreshToken,
      });

      const { credentials } = await this.oauth2Client.refreshAccessToken();

      // Update the social account with new tokens
      try {
        await this.socialAccountsService.updateSocialAccount(
          userId,
          "youtube",
          youtubeAccount.accountId,
          {
            accessToken: credentials.access_token,
            refreshToken:
              credentials.refresh_token || youtubeAccount.refreshToken,
            expiresAt: credentials.expiry_date
              ? Math.floor(credentials.expiry_date / 1000)
              : undefined,
          },
        );
      } catch (updateError) {
        console.error("Failed to update social account:", updateError);
        // Log more details about the error
        if (updateError.errors) {
          console.error(
            "Validation errors:",
            JSON.stringify(updateError.errors, null, 2),
          );
        }
        // If update fails, still return the new access token
        // The user will need to re-authenticate next time
      }

      return credentials.access_token;
    } catch (error) {
      console.error("Failed to refresh YouTube token:", error);
      throw new BadRequestException("Failed to refresh YouTube token");
    }
  }

  async autoRefreshExpiringYouTubeTokens() {
    const oneHourFromNow = Date.now() + 60 * 60 * 1000;
    // Find users with tokens expiring within the next hour
    const users =
      await this.usersService.findUsersWithExpiringYouTubeTokens(
        oneHourFromNow,
      );
    for (const user of users) {
      try {
        if (user.youtubeRefreshToken) {
          this.oauth2Client.setCredentials({
            refresh_token: user.youtubeRefreshToken,
          });
          const { credentials } = await this.oauth2Client.refreshAccessToken();
          await this.usersService.update(user._id as string, {
            youtubeAccessToken: credentials.access_token,
            youtubeAccessTokenExpiry: credentials.expiry_date,
          });
        }
      } catch (error) {
        const errorMsg = error?.message || error?.toString();
        console.error(
          `Failed to refresh YouTube token for user ${user.email}: ${errorMsg}`,
        );
        // If the error is invalid_grant, clear the user's YouTube tokens
        if (errorMsg && errorMsg.includes("invalid_grant")) {
          await this.usersService.update(user._id as string, {
            youtubeAccessToken: null,
            youtubeRefreshToken: null,
            youtubeAccessTokenExpiry: null,
            youtubeRefreshTokenExpiry: null,
          });
          console.warn(
            `YouTube tokens cleared for user ${user.email} due to invalid_grant. User must re-authenticate.`,
          );
        }
      }
    }
  }

  /**
   * Exchange Instagram Business code for short-lived and long-lived access tokens (2025+ flow)
   * Fixed to handle large user_id numbers correctly
   */
  async exchangeCodeForInstagramBusinessAccessToken(
    code: string,
  ): Promise<{ shortLived: any; longLived: any }> {
    try {
      const clientId = this.configService.get<string>("INSTAGRAM_CLIENT_ID");
      const clientSecret = this.configService.get<string>(
        "INSTAGRAM_CLIENT_SECRET",
      );
      const redirectUri = "https://uat.groreels.com/auth/instagram/callback";
      console.log(`ClientID: ${clientId} and ClientSecret: ${clientSecret}`);

      // Step 1: Exchange code for short-lived access token
      const shortLivedResponse = await axios.post(
        "https://api.instagram.com/oauth/access_token",
        new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: "authorization_code",
          redirect_uri: redirectUri,
          code: code,
        }),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          // FIX: Transform response to handle large user_id numbers
          transformResponse: (data) => {
            const fixedData = data.replace(
              /"user_id":\s*(\d+)/g,
              '"user_id":"$1"',
            );
            return JSON.parse(fixedData);
          },
        },
      );

      const shortLived = shortLivedResponse.data;
      if (!shortLived.access_token) {
        throw new Error("No short-lived access token received");
      }

      // Step 2: Exchange short-lived token for long-lived token
      const longLivedResponse = await axios.get(
        "https://graph.instagram.com/access_token",
        {
          params: {
            grant_type: "ig_exchange_token",
            client_secret: clientSecret,
            access_token: shortLived.access_token,
          },
        },
      );

      const longLived = longLivedResponse.data;
      if (!longLived.access_token) {
        throw new Error("No long-lived access token received");
      }

      console.log(
        `shortlived: ${JSON.stringify(shortLived)} longlived: ${JSON.stringify(longLived)}`,
      );
      return { shortLived, longLived };
    } catch (error) {
      console.error(
        "Error exchanging code for Instagram Business access token:",
        error.response?.data || error,
      );
      throw new InternalServerErrorException(
        "Failed to exchange code for Instagram Business access token",
      );
    }
  }

  // Updated profile fetching for Instagram Business API with simpler approach
  async getInstagramProfile(accessToken: string): Promise<any> {
    // Try business profile first
    try {
      // Try to get user's Facebook pages (business profile)
      const pagesResponse = await axios.get(
        `https://graph.facebook.com/me/accounts?access_token=${accessToken}`,
      );
      for (const page of pagesResponse.data.data) {
        try {
          const instagramResponse = await axios.get(
            `https://graph.facebook.com/${page.id}?fields=instagram_business_account&access_token=${page.access_token || accessToken}`,
          );
          if (instagramResponse.data.instagram_business_account) {
            const instagramAccountId =
              instagramResponse.data.instagram_business_account.id;
            const profileResponse = await axios.get(
              `https://graph.facebook.com/${instagramAccountId}?fields=id,username,name,profile_picture_url,followers_count,media_count&access_token=${page.access_token || accessToken}`,
            );
            return profileResponse.data;
          }
        } catch (pageError) {
          console.log(
            "No Instagram business account found for page:",
            page.id,
            pageError.response?.data,
          );
          continue;
        }
      }
      // If no business account found, throw to trigger fallback
      throw new Error("No Instagram business account found");
    } catch (businessError) {
      console.error(
        "Business profile fetch failed, trying basic profile...",
        businessError?.response?.data || businessError.message,
      );
      // Fallback to basic profile
      try {
        const response = await axios.get(
          `https://graph.instagram.com/me?fields=id,account_type,media_count&access_token=${accessToken}`,
        );
        return response.data;
      } catch (basicError) {
        console.error(
          "Basic profile fetch also failed.",
          basicError?.response?.data || basicError.message,
        );
        // Return minimal info
        return { id: null, error: "Could not fetch any Instagram profile" };
      }
    }
  }

  /**
   * Simplified approach - just store the token and minimal info
   * Let the frontend handle profile fetching when needed
   */
  async connectOrRegisterInstagramBusinessUser(
    igUserId: string,
    accessToken: string,
    expiresIn: number,
  ) {
    // Calculate actual expiry timestamp (current time + expires_in seconds)
    const expiryTimestamp = Date.now() + expiresIn * 1000;

    // Try to get basic profile info, but don't fail if it doesn't work
    let profile: any = { id: igUserId };
    try {
      // Try simple approach first
      const basicInfo = await axios.get(
        `https://graph.instagram.com/me?fields=id,account_type,media_count&access_token=${accessToken}`,
      );
      profile = basicInfo.data;
      console.log("Got basic Instagram profile:", profile);
    } catch (err) {
      console.error(
        "Could not fetch Instagram profile, using minimal info:",
        err.response?.data || err.message,
      );
    }

    // Prepare social account data with proper typing
    const socialAccountData = {
      platform: "instagram" as const,
      accountId: igUserId,
      accessToken: accessToken,
      expiresAt: Math.floor(expiryTimestamp / 1000),
      isConnected: true,
      lastSyncedAt: new Date(),
      profile: {
        username: profile.username || `instagram_${igUserId}`,
        displayName: profile.username || `Instagram User ${igUserId}`,
        email: `instagram_${igUserId}@placeholder.com`,
        profilePicture: profile.profile_picture_url || null,
      },
      data: {
        username: profile.username || null,
        profilePicture: profile.profile_picture_url || null,
        mediaCount: profile.media_count || 0,
        followersCount: profile.followers_count || null,
        followingCount: profile.following_count || null,
        accountType: profile.account_type || "BUSINESS",
      },
    };

    console.log(
      "Prepared Instagram social account data:",
      JSON.stringify(socialAccountData, null, 2),
    );

    const updateData: any = {
      name: profile?.username || `Instagram User ${igUserId}`,
      avatar: profile?.profile_picture_url || null,
      authMethod: "instagram",
    };

    let user = await this.usersService.findByInstagramId(igUserId);

    if (user) {
      user = await this.usersService.update(user._id as string, updateData);
      await this.socialAccountsService.addSocialAccount(
        user._id.toString(),
        socialAccountData,
      );
      // Refresh user to get the updated social accounts
      user = await this.usersService.findById(user._id.toString());
      console.log("Updated existing user with Instagram data");
    } else {
      const createUserDto: any = {
        ...updateData,
        isEmailVerified: true,
        role: UserRole.AGENCY_ADMIN,
        email: `instagram_${igUserId}@placeholder.com`,
        password: await bcrypt.hash("default_password", 10),
        socialAccounts: [socialAccountData],
      };
      user = await this.usersService.create(createUserDto);
      console.log("Created new user with Instagram data");
    }

    return user;
  }

  // Alternative: For Instagram Basic Display API with large number fix
  async getInstagramBasicProfile(
    accessToken: string,
    userId: string,
  ): Promise<any> {
    try {
      const response = await axios.get(
        `https://graph.instagram.com/v18.0/${userId}?fields=id,username,media_count,account_type&access_token=${accessToken}`,
      );

      return response.data;
    } catch (error) {
      console.error(
        "Error fetching Instagram Basic profile:",
        error.response?.data || error,
      );
      throw new InternalServerErrorException(
        "Failed to fetch Instagram Basic profile",
      );
    }
  }

  async refreshInstagramAccessToken(userId: string): Promise<string> {
    try {
      const user = await this.usersService.findById(userId);
      if (!user) {
        throw new UnauthorizedException("User not found");
      }

      // Find Instagram social account
      const instagramAccount = user.socialAccounts?.find(
        (acc) => acc.platform === "instagram",
      );

      if (!instagramAccount || !instagramAccount.accessToken) {
        throw new UnauthorizedException("Instagram token not found");
      }

      const response = await axios.get(
        `https://graph.instagram.com/refresh_access_token`,
        {
          params: {
            grant_type: "ig_refresh_token",
            access_token: instagramAccount.accessToken,
          },
        },
      );

      const newAccessToken = response.data.access_token;
      const newExpiry = Math.floor(
        (Date.now() + response.data.expires_in * 1000) / 1000,
      );

      // Update the social account with new token
      await this.socialAccountsService.updateSocialAccount(
        userId,
        "instagram",
        instagramAccount.accountId,
        {
          accessToken: newAccessToken,
          expiresAt: newExpiry,
        },
      );

      return newAccessToken;
    } catch (error) {
      console.error("Failed to refresh Instagram access token:", error);
      throw new InternalServerErrorException(
        "Failed to refresh Instagram token",
      );
    }
  }

  async validateInstagramAccessToken(userId: string): Promise<boolean> {
    try {
      const user = await this.usersService.findById(userId);
      if (!user) {
        return false;
      }

      // Find Instagram social account
      const instagramAccount = user.socialAccounts?.find(
        (acc) => acc.platform === "instagram",
      );

      if (!instagramAccount || !instagramAccount.accessToken) {
        return false;
      }

      if (
        instagramAccount.expiresAt &&
        instagramAccount.expiresAt < Math.floor(Date.now() / 1000)
      ) {
        // Token is expired, try to refresh it
        try {
          await this.refreshInstagramAccessToken(userId);
          return true; // If refresh is successful, token is now valid
        } catch (refreshError) {
          console.error(
            "Failed to refresh expired Instagram token:",
            refreshError,
          );
          return false; // Refresh failed
        }
      }

      // Validate token by making a simple API call
      try {
        const response = await axios.get(
          `https://graph.instagram.com/debug_token`,
          {
            params: {
              input_token: instagramAccount.accessToken,
              access_token: instagramAccount.accessToken,
            },
          },
        );

        return response.data.data.is_valid;
      } catch (error) {
        console.error("Token validation failed:", error);
        return false;
      }
    } catch (error) {
      console.error("Failed to validate Instagram access token:", error);
      return false;
    }
  }

  async deauthorizeInstagramUser(instagramUserId: string): Promise<void> {
    // Ensure instagramUserId is a string
    if (typeof instagramUserId !== "string") return;

    const user = await this.usersService.findByInstagramId(instagramUserId);
    if (!user) {
      console.log(`No user found with Instagram ID: ${instagramUserId}`);
      return;
    }

    // Find Instagram social account
    const instagramAccount = user.socialAccounts?.find(
      (acc) =>
        acc.platform === "instagram" && acc.accountId === instagramUserId,
    );

    if (instagramAccount) {
      // Disconnect the social account instead of deleting the user
      await this.socialAccountsService.disconnectSocialAccount(
        user._id.toString(),
        "instagram",
        instagramUserId,
      );
      console.log(`Disconnected Instagram account for user: ${user._id}`);
    } else {
      // If no social account found, delete the user (legacy behavior)
      if (typeof user._id === "string") {
        await this.usersService.delete(user._id);
      } else if (user._id && user._id.toString) {
        await this.usersService.delete(user._id.toString());
      }
      console.log(`Deleted user with Instagram ID: ${instagramUserId}`);
    }
  }

  /**
   * Handle Instagram data deletion request
   * Should parse signed_request, delete user data, and return confirmation code
   */
  async handleInstagramDataDeletion(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    signedRequest: string,
  ): Promise<{ confirmationCode: string }> {
    // Placeholder: parse signed_request and extract user_id
    // In production, verify the signature using your Instagram App Secret
    // For now, just return a dummy confirmation code
    // TODO: Implement proper signed_request parsing and verification
    const confirmationCode = `CONFIRM-${Date.now()}`;
    // Optionally, delete user data here
    // await this.deauthorizeInstagramUser(userId);
    return { confirmationCode };
  }

  async getUserByEmail(email: string) {
    return this.usersService.findByEmail(email);
  }

  async findUserById(userId: string) {
    return this.usersService.findById(userId);
  }

  async updateUserTokens(
    userId: string,
    tokens: {
      accessToken?: string;
      refreshToken?: string;
      expiryDate?: number;
    },
  ) {
    const updateData: any = {};

    if (tokens.accessToken) {
      updateData["youtube.accessToken"] = tokens.accessToken;
    }

    if (tokens.refreshToken) {
      updateData["youtube.refreshToken"] = tokens.refreshToken;
    }

    if (tokens.expiryDate) {
      updateData["youtube.expiryDate"] = tokens.expiryDate;
    }

    return this.usersService.updateUser(userId, updateData);
  }

  async updateUserLastTokenRefresh(userId: string) {
    return this.usersService.update(userId, { lastTokenRefreshAt: new Date() });
  }

  //   /**
  //    * Exchange Instagram Business code for short-lived and long-lived access tokens (2025+ flow)
  //    */
  //   async exchangeCodeForInstagramBusinessAccessToken(code: string): Promise<{ shortLived: any, longLived: any }> {
  //     try {
  //       const clientId = this.configService.get<string>("INSTAGRAM_CLIENT_ID");
  //       const clientSecret = this.configService.get<string>("INSTAGRAM_CLIENT_SECRET");
  //       const redirectUri = "https://uat.groreels.com/auth/instagram/callback";
  //       console.log(`ClientID: ${clientId} and ClientSecret: ${clientSecret}`)
  //       // Step 1: Exchange code for short-lived access token
  //       const shortLivedResponse = await axios.post(
  //         "https://api.instagram.com/oauth/access_token",
  //         new URLSearchParams({
  //           client_id: clientId,
  //           client_secret: clientSecret,
  //           grant_type: "authorization_code",
  //           redirect_uri: redirectUri,
  //           code: code,
  //         }),
  //         {
  //           headers: {
  //             "Content-Type": "application/x-www-form-urlencoded",
  //           },
  //         },
  //       );
  //       const shortLived = shortLivedResponse.data;
  //       if (!shortLived.access_token) {
  //         throw new Error("No short-lived access token received");
  //       }

  //       // Step 2: Exchange short-lived token for long-lived token
  //       const longLivedResponse = await axios.get(
  //         "https://graph.instagram.com/access_token",
  //         {
  //           params: {
  //             grant_type: "ig_exchange_token",
  //             client_secret: clientSecret,
  //             access_token: shortLived.access_token,
  //           },
  //         },
  //       );
  //       const longLived = longLivedResponse.data;
  //       if (!longLived.access_token) {
  //         throw new Error("No long-lived access token received");
  //       }
  //       console.log(`shortlived : ${JSON.stringify(shortLived)} longlived : ${JSON.stringify(longLived)}`)
  //       return { shortLived, longLived };
  //     } catch (error) {
  //       console.error("Error exchanging code for Instagram Business access token:", error.response?.data || error);
  //       throw new InternalServerErrorException(
  //         "Failed to exchange code for Instagram Business access token",
  //       );
  //     }
  //   }

  // // Updated profile fetching for Instagram Business API
  // async getInstagramProfile(accessToken: string): Promise<any> {
  //   try {
  //     // First, get the Facebook pages connected to this access token
  //     const pagesResponse = await axios.get(
  //       `https://graph.facebook.com/v18.0/me/accounts?access_token=${accessToken}`
  //     );

  //     // Then get Instagram business accounts connected to these pages
  //     for (const page of pagesResponse.data.data) {
  //       try {
  //         const instagramResponse = await axios.get(
  //           `https://graph.facebook.com/v18.0/${page.id}?fields=instagram_business_account&access_token=${accessToken}`
  //         );

  //         if (instagramResponse.data.instagram_business_account) {
  //           const instagramAccountId = instagramResponse.data.instagram_business_account.id;

  //           // Get Instagram account details
  //           const profileResponse = await axios.get(
  //             `https://graph.facebook.com/v18.0/${instagramAccountId}?fields=id,username,name,profile_picture_url,followers_count,media_count&access_token=${accessToken}`
  //           );

  //           return profileResponse.data;
  //         }
  //       } catch (pageError) {
  //         console.log("No Instagram account found for page:", page.id);
  //         continue;
  //       }
  //     }

  //     throw new Error("No Instagram business account found");
  //   } catch (error) {
  //     console.error("Error fetching Instagram profile:", error.response?.data || error);
  //     throw new InternalServerErrorException(
  //       "Failed to fetch Instagram profile",
  //     );
  //   }
  // }

  // // Alternative: For Instagram Basic Display API
  // async getInstagramBasicProfile(accessToken: string, userId: string): Promise<any> {
  //   try {
  //     const response = await axios.get(
  //       `https://graph.instagram.com/v18.0/${userId}?fields=id,username,media_count,account_type&access_token=${accessToken}`,
  //     );

  //     return response.data;
  //   } catch (error) {
  //     console.error("Error fetching Instagram Basic profile:", error.response?.data || error);
  //     throw new InternalServerErrorException(
  //       "Failed to fetch Instagram Basic profile",
  //     );
  //   }
  // }

  //   async connectOrRegisterInstagram(
  //     state: string,
  //     accessToken: string,
  //     instagramId: string,
  //   ) {
  //     try {
  //       const profile = await this.getInstagramProfile(accessToken);

  //       if (!profile.id) {
  //         throw new Error("Invalid Instagram profile response");
  //       }

  //       const instagramData = {
  //         username: profile.username,
  //         profilePicture: profile.profile_picture_url,
  //         mediaCount: profile.media_count,
  //         followersCount: profile.followers_count,
  //         followingCount: profile.following_count,
  //       };

  //       let user = await this.usersService.findByInstagramId(instagramId);

  //       const updateData: UpdateUserDto = {
  //         instagramId: instagramId,
  //         instagramAccessToken: accessToken,
  //         instagramAccessTokenExpiry: Date.now() + 60 * 24 * 60 * 60 * 1000, // 60 days
  //         instagramData,
  //         name: profile.username,
  //         avatar: profile.profile_picture_url,
  //         authMethod: user?.authMethod
  //           ? user.authMethod.includes("instagram")
  //             ? user.authMethod
  //             : `${user.authMethod},instagram`
  //           : "instagram",
  //       };

  //       if (user) {
  //         user = await this.usersService.update(user._id as string, updateData);
  //       } else {
  //         const createUserDto: CreateUserDto = {
  //           ...updateData,
  //           isEmailVerified: true,
  //           role: UserRole.AGENCY_ADMIN,
  //           email: `instagram_${instagramId}@placeholder.com`,
  //           password: await bcrypt.hash("default_password", 10),
  //         };

  //         try {
  //           user = await this.usersService.create(createUserDto);
  //         } catch (createError) {
  //           if (createError.code === 11000) {
  //             const createUserDtoRetry = {
  //               ...createUserDto,
  //               email: `instagram_${instagramId}_${Date.now()}@placeholder.com`,
  //             };
  //             user = await this.usersService.create(createUserDtoRetry);
  //           } else {
  //             throw createError;
  //           }
  //         }
  //       }

  //       const tokenPair = await this.login(user);

  //       return {
  //         message: "Instagram account connected successfully",
  //         user,
  //         ...tokenPair,
  //         instagramStatus: { connected: true },
  //       };
  //     } catch (error) {
  //       console.error("Error in connectOrRegisterInstagram:", error);
  //       throw new Error(`Failed to connect Instagram account: ${error.message}`);
  //     }
  //   }

  //   async refreshInstagramAccessToken(userId: string): Promise<string> {
  //     try {
  //       const user = await this.usersService.findById(userId);
  //       if (!user || !user.instagramAccessToken) {
  //         throw new UnauthorizedException('User or Instagram token not found');
  //       }

  //       const response = await axios.get(
  //         `https://graph.instagram.com/refresh_access_token`,
  //         {
  //           params: {
  //             grant_type: 'ig_refresh_token',
  //             access_token: user.instagramAccessToken,
  //           },
  //         },
  //       );

  //       const newAccessToken = response.data.access_token;
  //       const newExpiry = Date.now() + response.data.expires_in * 1000;

  //       await this.usersService.update(userId, {
  //         instagramAccessToken: newAccessToken,
  //         instagramAccessTokenExpiry: newExpiry,
  //       });

  //       return newAccessToken;
  //     } catch (error) {
  //       console.error('Failed to refresh Instagram access token:', error);
  //       throw new InternalServerErrorException(
  //         'Failed to refresh Instagram token',
  //       );
  //     }
  //   }

  //   async validateInstagramAccessToken(userId: string): Promise<boolean> {
  //     try {
  //       const user = await this.usersService.findById(userId);
  //       if (!user || !user.instagramAccessToken) {
  //         return false;
  //       }

  //       if (user.instagramAccessTokenExpiry && user.instagramAccessTokenExpiry < Date.now()) {
  //         // Token is expired, try to refresh it
  //         try {
  //           await this.refreshInstagramAccessToken(userId);
  //           return true; // If refresh is successful, token is now valid
  //         } catch (refreshError) {
  //           console.error("Failed to refresh expired Instagram token:", refreshError);
  //           return false; // Refresh failed
  //         }
  //       }

  //       const profile = await this.getInstagramProfile(user.instagramAccessToken);
  //       return !!profile.id;
  //     } catch (error) {
  //       console.error("Failed to validate Instagram access token:", error);
  //       return false;
  //     }
  //   }

  //   async deauthorizeInstagramUser(instagramUserId: string): Promise<void> {
  //     // Ensure instagramUserId is a string
  //     if (typeof instagramUserId !== 'string') return;
  //     const user = await this.usersService.findByInstagramId(instagramUserId);
  //     if (user && typeof user._id === 'string') {
  //       await this.usersService.delete(user._id);
  //     } else if (user && user._id && user._id.toString) {
  //       await this.usersService.delete(user._id.toString());
  //     }
  //     // else: user not found, nothing to do
  //   }

  //   /**
  //    * Handle Instagram data deletion request
  //    * Should parse signed_request, delete user data, and return confirmation code
  //    */
  //   async handleInstagramDataDeletion(signedRequest: string): Promise<{ confirmationCode: string }> {
  //     // Placeholder: parse signed_request and extract user_id
  //     // In production, verify the signature using your Instagram App Secret
  //     // For now, just return a dummy confirmation code
  //     // TODO: Implement proper signed_request parsing and verification
  //     const confirmationCode = `CONFIRM-${Date.now()}`;
  //     // Optionally, delete user data here
  //     // await this.deauthorizeInstagramUser(userId);
  //     return { confirmationCode };
  //   }

  //   /**
  //    * Find or create a user by Instagram Business ID and store the long-lived access token
  //    */
  //   async connectOrRegisterInstagramBusinessUser(igUserId: string, accessToken: string, expiresIn: number) {
  //     let user = await this.usersService.findByInstagramId(igUserId);
  //     if (user) {
  //       await this.usersService.update(user._id as string, {
  //         instagramId: igUserId,
  //         instagramAccessToken: accessToken,
  //         instagramAccessTokenExpiry: expiresIn, // Store the expires_in value directly for now
  //       });
  //     } else {
  //       user = await this.usersService.create({
  //         instagramId: igUserId,
  //         instagramAccessToken: accessToken,
  //         instagramAccessTokenExpiry: expiresIn, // Store the expires_in value directly for now
  //         isEmailVerified: true,
  //         role: UserRole.AGENCY_ADMIN,
  //         email: `instagram_${igUserId}@placeholder.com`,
  //         password: "default_password",
  //       });
  //     }
  //     return user;
  //   }

  async findUserByEmail(email: string) {
    return this.usersService.findByEmail(email);
  }

  //   async updateUserLastTokenRefresh(userId: string) {
  //     return this.usersService.update(userId, { lastTokenRefreshAt: new Date() });
  //   }
}
