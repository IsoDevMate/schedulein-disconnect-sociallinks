import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Res,
  HttpStatus,
  UseGuards,
  Redirect,
  Req,
} from "@nestjs/common";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { Response, Request } from "express";
import { ResetPasswordDto } from "./dto/ResetPassword.dto";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { ConfigService } from "@nestjs/config";
import { v4 as uuidv4 } from "uuid";
import { ResponseUtil } from "../common/utils/response.util";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from "@nestjs/swagger";
import { TikTokAuthGuard } from "./guards/tiktok-auth.guard";
import { JwtService } from "@nestjs/jwt";
interface AuthenticatedRequest extends Request {
  user?: any;
}

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {}

  private getDeviceInfo(req: Request): string {
    const userAgent = req.headers["user-agent"] || "";
    return userAgent.substring(0, 255); // Limit length
  }

  private getIpAddress(req: Request): string {
    return (
      (req.headers["x-forwarded-for"] as string) ||
      (req.headers["x-real-ip"] as string) ||
      req.connection.remoteAddress ||
      req.socket.remoteAddress ||
      ""
    );
  }

  @ApiOperation({ summary: "User login" })
  @ApiResponse({ status: 200, description: "Login successful" })
  @ApiResponse({ status: 401, description: "Invalid credentials" })
  @Post("login")
  async login(
    @Body() loginDto: LoginDto,
    @Res() res: Response,
    @Req() req: Request,
  ) {
    try {
      const user = await this.authService.validateUser(
        loginDto.email,
        loginDto.password,
      );
      if (!user) {
        return ResponseUtil.error(
          res,
          HttpStatus.UNAUTHORIZED,
          "Invalid credentials",
        );
      }

      const deviceInfo = this.getDeviceInfo(req);
      const ipAddress = this.getIpAddress(req);

      const tokenPair = await this.authService.login(
        user,
        deviceInfo,
        ipAddress,
      );

      if (!tokenPair) {
        return ResponseUtil.error(
          res,
          HttpStatus.INTERNAL_SERVER_ERROR,
          "Failed to generate token",
        );
      }

      const accessToken = tokenPair.accessToken;
      if (!accessToken) {
        return ResponseUtil.error(
          res,
          HttpStatus.INTERNAL_SERVER_ERROR,
          "Access token generation failed",
        );
      }

      const cleanUserData = user._doc || user.toObject();
      // Remove sensitive information
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { password, resetToken, confirmationToken, ...safeUserData } =
        cleanUserData;

      return ResponseUtil.success(
        res,
        HttpStatus.OK,
        {
          user: safeUserData,
          accessToken,
          refreshToken: tokenPair.refreshToken,
          expiresIn: tokenPair.expires_in,
          deviceInfo: deviceInfo,
        },
        "Login successful",
      );
    } catch {
      return ResponseUtil.error(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        "Internal server error",
      );
    }
  }

  @ApiOperation({ summary: "User registration" })
  @ApiResponse({ status: 201, description: "Registration successful" })
  @ApiResponse({ status: 400, description: "Bad request" })
  @ApiResponse({ status: 409, description: "Email already exists" })
  @Post("register")
  async register(
    @Body() registerDto: { email: string; password: string; role: string },
    @Res() res: Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    @Req() req: Request,
  ) {
    try {
      await this.authService.register(
        registerDto.email,
        registerDto.password,
        registerDto.role,
      );
      return ResponseUtil.success(
        res,
        HttpStatus.CREATED,
        null,
        "Registration successful. Please confirm your email.",
      );
    } catch (error) {
      // SECURITY FIX: Return proper HTTP status codes and error messages
      if (error.message === "Email already exists") {
        return ResponseUtil.error(res, HttpStatus.CONFLICT, "Email already exists");
      }
      if (error.message.includes("Email service temporarily unavailable")) {
        return ResponseUtil.error(res, HttpStatus.SERVICE_UNAVAILABLE, error.message);
      }
      if (error.message.includes("Failed to send confirmation email")) {
        return ResponseUtil.error(res, HttpStatus.INTERNAL_SERVER_ERROR, error.message);
      }

      // Log the actual error for debugging
      console.error("Registration error:", error);
      return ResponseUtil.error(res, HttpStatus.BAD_REQUEST, error.message);
    }
  }

  @ApiOperation({ summary: "Refresh platform access token" })
  @ApiResponse({ status: 200, description: "Token refreshed successfully" })
  @ApiResponse({ status: 401, description: "Invalid refresh token" })
  @Post("refresh")
  async refreshToken(
    @Body("refreshToken") refreshToken: string,
    @Res() res: Response,
  ) {
    try {
      if (!refreshToken) {
        return ResponseUtil.error(
          res,
          HttpStatus.BAD_REQUEST,
          "Refresh token is required",
        );
      }

      // Verify the refresh token
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get<string>("JWT_SECRET"),
      });

      // Find the user
      const user = await this.authService.findUserByEmail(payload.email);
      if (!user) {
        return ResponseUtil.error(
          res,
          HttpStatus.UNAUTHORIZED,
          "Invalid refresh token",
        );
      }

      // Generate new access token
      const newPayload = {
        email: user.email,
        role: user.role,
        sub: user._id,
        authMethod: user.authMethod,
        ...(user.TiktokId && { tiktokId: user.TiktokId }),
        ...(user.TiktokAccessToken && {
          tiktokAccessToken: user.TiktokAccessToken,
        }),
        ...(user.linkedInAccessToken && {
          linkedInAccessToken: user.linkedInAccessToken,
        }),
        ...(user.tiktokData && { tiktokData: user.tiktokData }),
        ...(user.name && { name: user.name }),
        ...(user.avatar && { avatar: user.avatar }),
      };

      const accessToken = this.jwtService.sign(newPayload, {
        secret: this.configService.get<string>("JWT_SECRET"),
        expiresIn: "24h",
      });

      // Update user's last token refresh time
      await this.authService.updateUserLastTokenRefresh(user._id as string);

      return ResponseUtil.success(res, HttpStatus.OK, {
        user,
        accessToken,
        expires_in: "24h",
      });
    } catch (error) {
      console.error("Error refreshing token:", error);
      return ResponseUtil.error(
        res,
        HttpStatus.UNAUTHORIZED,
        "Invalid refresh token",
      );
    }
  }

    @ApiOperation({ summary: "Confirm email" })
  @ApiResponse({ status: 200, description: "Email confirmed successfully" })
  @ApiResponse({ status: 400, description: "Invalid confirmation token or email already verified" })
  @ApiResponse({ status: 401, description: "Invalid confirmation token" })
  @Get("confirm-email")
  async confirmEmail(
    @Query("token") token: string,
    @Query("email") email: string,
    @Res() res: Response
  ) {
    try {
      // Validate required parameters
      if (!token) {
        return res.redirect("https://groreels.com/auth/login?missing_token=true");
      }
      if (!email) {
        return res.redirect("https://groreels.com/auth/login?missing_email=true");
      }

      await this.authService.confirmEmail(token, email);
      return res.redirect("https://groreels.com/auth/login?verified=true");
    } catch (error) {
      // Handle different error types with appropriate HTTP status codes
      if (error.message === "Email is already verified") {
        return res.redirect("https://groreels.com/auth/login?already_verified=true");
      }
      if (error.message === "Invalid confirmation token") {
        return res.redirect("https://groreels.com/auth/login?invalid_token=true");
      }
      if (error.message === "Email mismatch") {
        return res.redirect("https://groreels.com/auth/login?email_mismatch=true");
      }
      if (error.message === "Email is required for confirmation") {
        return res.redirect("https://groreels.com/auth/login?missing_email=true");
      }
      return res.redirect("https://groreels.com/auth/login?error=true");
    }
  }

  @ApiOperation({ summary: "Forgot password" })
  @ApiResponse({ status: 200, description: "Password reset email sent" })
  @ApiResponse({ status: 400, description: "Bad request" })
  @Post("forgot-password")
  async forgotPassword(
    @Body() forgotPasswordDto: ForgotPasswordDto,
    @Res() res: Response,
  ) {
    try {
      await this.authService.forgotPassword(forgotPasswordDto);
      return ResponseUtil.success(
        res,
        HttpStatus.OK,
        null,
        "Password reset email sent",
      );
    } catch (error) {
      return ResponseUtil.error(res, HttpStatus.BAD_REQUEST, error.message);
    }
  }

  @ApiOperation({ summary: "Reset password" })
  @ApiResponse({ status: 200, description: "Password reset successfully" })
  @ApiResponse({ status: 400, description: "Invalid or expired reset token" })
  @Post("reset-password")
  async resetPassword(
    @Body() resetPasswordDto: ResetPasswordDto,
    @Res() res: Response,
  ) {
    try {
      await this.authService.resetPassword(resetPasswordDto);
      return ResponseUtil.success(
        res,
        HttpStatus.OK,
        null,
        "Password reset successfully",
      );
    } catch (error) {
      return ResponseUtil.error(res, HttpStatus.BAD_REQUEST, error.message);
    }
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: "User logout" })
  @ApiResponse({ status: 200, description: "Logout successful" })
  @ApiResponse({ status: 401, description: "Unauthorized" })
  @Post("logout")
  @UseGuards(JwtAuthGuard)
  async logout(@Res() res: Response) {
    try {
      const userId = res.locals.user._id;
      await this.authService.logout(userId);
      return ResponseUtil.success(
        res,
        HttpStatus.OK,
        null,
        "Logout successful",
      );
    } catch (error) {
      return ResponseUtil.error(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        error.message,
      );
    }
  }

  @ApiOperation({ summary: "LinkedIn login" })
  @ApiResponse({
    status: 302,
    description: "Redirect to LinkedIn authorization",
  })
  @Get("linkedin")
  @Redirect("https://www.linkedin.com/oauth/v2/authorization", 302)
  linkedInLogin() {
    const clientId = this.configService.get<string>("LINKEDIN_CLIENT_ID");
    const redirectUri = "http://localhost:3000/auth/linkedin/callback";
    const scope =
      "openid profile email r_ads_reporting r_organization_social rw_organization_admin w_member_social r_ads w_organization_social rw_ads r_basicprofile r_organization_admin email r_1st_connections_size";
    const responseType = "code";
    const state = uuidv4();
    console.log("Initiating OAuth flow with state:", state);
    const url = `https://www.linkedin.com/oauth/v2/authorization?response_type=${responseType}&client_id=${clientId}&redirect_uri=${redirectUri}&state=${state}&scope=${scope}`;
    console.log("LinkedIn authentication URL:", url);
    return { url };
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: "Get authentication status" })
  @ApiResponse({ status: 200, description: "User authenticated" })
  @ApiResponse({ status: 500, description: "Internal server error" })
  @Get("authstatus")
  @UseGuards(JwtAuthGuard)
  async authStatus(@Res() res: Response, @Req() req: AuthenticatedRequest) {
    try {
      return ResponseUtil.success(
        res,
        HttpStatus.OK,
        req.user,
        "Authentication status",
      );
    } catch {
      return ResponseUtil.error(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        "Failed to get authentication status",
      );
    }
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: "Get LinkedIn company pages" })
  @ApiResponse({ status: 200, description: "Company pages found" })
  @ApiResponse({ status: 500, description: "Internal server error" })
  @Get("linkedin-company-pages")
  @UseGuards(JwtAuthGuard)
  async getLinkedInCompanyPages(@Res() res: Response) {
    try {
      const user = res.locals.user;
      if (!user.linkedInAccessToken) {
        return ResponseUtil.success(res, HttpStatus.OK, {
          message: "No LinkedIn account connected",
          pages: [],
        });
      }

      const organizationUrn = await this.authService
        .getLinkedInOrganizationUrn(user.linkedInAccessToken)
        .catch(() => null);

      if (!organizationUrn) {
        return ResponseUtil.success(res, HttpStatus.OK, {
          message: "No LinkedIn organization found",
          pages: [],
        });
      }

      const companyPages = await this.authService.getLinkedInCompanyPages(
        user.linkedInAccessToken,
        organizationUrn,
      );
      return ResponseUtil.success(res, HttpStatus.OK, {
        message: companyPages.length
          ? "Company pages found"
          : "No company pages found",
        pages: companyPages,
      });
    } catch (error) {
      console.error("Error fetching LinkedIn company pages:", error);
      return ResponseUtil.error(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        "Error fetching LinkedIn company pages",
      );
    }
  }

  @ApiOperation({ summary: "LinkedIn callback" })
  @ApiQuery({
    name: "code",
    required: true,
    description: "Authorization code from LinkedIn",
  })
  @ApiQuery({
    name: "state",
    required: true,
    description: "State parameter for CSRF protection",
  })
  @ApiResponse({ status: 200, description: "LinkedIn connected successfully" })
  @ApiResponse({ status: 500, description: "Internal server error" })
  @Get("linkedin/callback")
  async linkedInCallback(
    @Query("code") code: string,
    @Query("state") state: string,
    @Res() res: Response,
  ) {
    try {
      console.log("Received authorization code:", code);
      console.log("Received state:", state);

      const linkedInAccessToken =
        await this.authService.exchangeCodeForAccessToken(code);
      const response = await this.authService.connectOrRegisterLinkedIn(
        state,
        linkedInAccessToken,
      );
      console.log("LinkedIn connected successfully:", response);
      return ResponseUtil.success(res, HttpStatus.OK, {
        ...response,
        linkedInStatus: {
          connected: true,
          hasPages: response.hasLinkedInPages,
        },
      });
    } catch (error) {
      console.error("Error in LinkedIn callback:", error);
      return ResponseUtil.error(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        error.message,
      );
    }
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: "Connect LinkedIn" })
  @ApiResponse({
    status: 302,
    description: "Redirect to LinkedIn authorization",
  })
  @Get("linkedin-connect")
  @UseGuards(JwtAuthGuard)
  @Redirect()
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async linkedInConnect(@Res() res: Response) {
    const clientId = this.configService.get<string>("LINKEDIN_CLIENT_ID");
    const redirectUri = "http://localhost:3000/auth/linkedin-connect/callback";
    const scope =
      "openid profile email r_organization_social w_member_social r_basicprofile r_organization_admin email rw_ads r_ads w_organization_social rw_organization_admin r_1st_connections_size";
    const state = uuidv4();
    const url = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${clientId}&redirect_uri=${redirectUri}&state=${state}&scope=${scope}`;

    return { url };
  }

  @ApiOperation({ summary: "LinkedIn connect callback" })
  @ApiQuery({
    name: "code",
    required: false,
    description: "Authorization code from LinkedIn",
  })
  @ApiQuery({
    name: "state",
    required: false,
    description: "State parameter for CSRF protection",
  })
  @ApiQuery({
    name: "error",
    required: false,
    description: "Error message from LinkedIn",
  })
  @ApiResponse({ status: 302, description: "Redirect to profile page" })
  @Get("linkedin-connect/callback")
  async linkedInConnectCallback(
    @Query("code") code: string,
    @Query("state") state: string,
    @Query("error") error: string,
    @Res() res: Response,
  ) {
    if (error) {
      return res.redirect(`https://groreels.com/profile?error=${error}`);
    }

    try {
      const linkedInAccessToken =
        await this.authService.exchangeCodeForAccessToken(code);
      const profile =
        await this.authService.getLinkedInProfile(linkedInAccessToken);

      if (profile.email) {
        await this.authService.updateUserLinkedIn(
          profile.email,
          linkedInAccessToken,
        );
        return res.redirect("https://groreels.com/profile?success=true");
      } else {
        return res.redirect("https://groreels.com/profile?error=no_email");
      }
    } catch (error) {
      console.error("LinkedIn connect callback error:", error);
      return res.redirect(
        `https://groreels.com/profile?error=${error.message}`,
      );
    }
  }

  @ApiOperation({ summary: "TikTok login" })
  @ApiResponse({
    status: 302,
    description: "Redirect to TikTok authorization",
  })
  @Get("tiktok")
  tiktokLogin(@Res() res: Response) {
    const clientKey = this.configService.get<string>("TIKTOK_CLIENT_KEY");
    const redirectUri =
      this.configService.get<string>("TIKTOK_REDIRECT_URI") ||
      "https://uat.groreels.com/auth/tiktok/callback";
    console.log("Initiating TikTok OAuth flow");
    console.log("Client key:", clientKey);
    console.log("Redirect URI:", redirectUri);

    const scope = [
      "user.info.basic",
      "video.publish",
      "video.upload",
      "user.info.profile",
      "user.info.stats",
      "video.list",
    ].join(",");

    const responseType = "code";
    const state = uuidv4();
    const url = `https://www.tiktok.com/v2/auth/authorize/?client_key=${clientKey}&scope=${scope}&response_type=${responseType}&redirect_uri=${redirectUri}&state=${state}`;
    console.log("TikTok authentication URL:", url);
    res.redirect(url);
  }

  @ApiOperation({ summary: "TikTok callback" })
  @ApiQuery({
    name: "code",
    required: false,
    description: "Authorization code from TikTok",
  })
  @ApiQuery({
    name: "state",
    required: false,
    description: "State parameter for CSRF protection",
  })
  @ApiResponse({ status: 200, description: "TikTok connected successfully" })
  @ApiResponse({ status: 500, description: "Internal server error" })
  @Get("tiktok/callback")
  async tiktokCallback(
    @Query("code") code: string,
    @Query("state") state: string,
    @Res() res: Response,
  ) {
    try {
      console.log("Received authorization code:", code);
      console.log("Received state:", state);

      if (!code) {
        console.error("No authorization code received from TikTok");
        return res.redirect(`https://groreels.com/profile?error=no_auth_code`);
      }

      console.log("Exchanging code for TikTok access token...");
      let tiktokAccessTokenResponse;
      try {
        tiktokAccessTokenResponse =
          await this.authService.exchangeCodeForTikTokAccessToken(code);
        console.log("TikTok access token received:", tiktokAccessTokenResponse);
      } catch (tokenError) {
        console.error(
          "Failed to exchange code for TikTok access token:",
          tokenError,
        );
        return res.redirect(
          `https://groreels.com/profile?error=token_exchange_failed`,
        );
      }

      try {
        console.log("Connecting or registering TikTok account...");
        const response = await this.authService.connectOrRegisterTikTok(
          state,
          tiktokAccessTokenResponse.access_token,
          tiktokAccessTokenResponse.refresh_token,
          tiktokAccessTokenResponse.expires_in,
          tiktokAccessTokenResponse.refresh_expires_in,
        );
        console.log("TikTok account connected successfully:", response);

        const redirectUrl = new URL(
          "https://groreels.com/auth/tiktok/callback",
        );
        redirectUrl.searchParams.set("success", "true");
        redirectUrl.searchParams.set("tiktok_connected", "true");
        redirectUrl.searchParams.set(
          "tiktokStatus",
          JSON.stringify(response.tiktokStatus.connected),
        );
        redirectUrl.searchParams.set("accessToken", response.accessToken);
        redirectUrl.searchParams.set("refreshToken", response.refreshToken);

        console.log("Redirecting to:", redirectUrl.toString());
        return res.redirect(redirectUrl.toString());
      } catch (connectError) {
        console.error(
          "Error connecting or registering TikTok account:",
          connectError,
        );
        return res.redirect(
          `https://groreels.com/profile?error=${encodeURIComponent(connectError.message)}`,
        );
      }
    } catch (error) {
      console.error("Error in TikTok callback:", error);
      // return ResponseUtil.error(
      //   res,
      //   HttpStatus.INTERNAL_SERVER_ERROR,
      //   error.message,
      // );
      return res.redirect(
        `https://groreels.com/profile?error=unexpected_error`,
      );
    }
  }

  @ApiOperation({ summary: "Get TikTok authentication status" })
  @ApiResponse({ status: 200, description: "User authenticated" })
  @ApiResponse({ status: 500, description: "Internal server error" })
  @Get("tiktok/authstatus")
  @UseGuards(TikTokAuthGuard)
  async tiktokAuthStatus(@Res() res: Response) {
    try {
      const user = res.locals.user;
      return ResponseUtil.success(res, HttpStatus.OK, user);
    } catch (error) {
      return ResponseUtil.error(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        error.message,
      );
    }
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: "Get YouTube authentication URL" })
  @ApiResponse({
    status: 200,
    description: "YouTube authentication URL generated",
  })
  @ApiResponse({ status: 500, description: "Internal server error" })
  @Get("youtube/login")
  @Redirect()
  async youtubeLogin(@Res() res: Response) {
    try {
      const clientId = this.configService.get<string>("YOUTUBE_CLIENT_ID");
      const redirectUri = this.configService.get<string>(
        "YOUTUBE_REDIRECT_URI",
      );
      console.log("YOUTUBE_REDIRECT_URI:", redirectUri);

      const scope = [
        "https://www.googleapis.com/auth/youtube.upload",
        "https://www.googleapis.com/auth/youtube.readonly",
        "https://www.googleapis.com/auth/userinfo.profile",
        "https://www.googleapis.com/auth/userinfo.email",
        "openid",
        "email",
      ].join(" ");
      const responseType = "code";
      const state = uuidv4();
      const accessType = "offline";
      const prompt = "consent";
      const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${encodeURIComponent(scope)}&response_type=${responseType}&state=${state}&access_type=${accessType}&prompt=${prompt}`;
      console.log("YouTube authentication URL:", url);
      return { url };
    } catch (error) {
      return ResponseUtil.error(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        error.message,
      );
    }
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: "Handle YouTube OAuth callback" })
  @ApiResponse({
    status: 200,
    description: "YouTube authentication successful",
  })
  @ApiQuery({
    name: "code",
    required: true,
    description: "Authorization code from YouTube",
  })
  @ApiQuery({
    name: "state",
    required: false,
    description: "State parameter for CSRF protection",
  })
  @ApiResponse({
    status: 200,
    description: "YouTube authentication successful",
  })
  @ApiResponse({ status: 400, description: "No authorization code received" })
  @ApiResponse({ status: 500, description: "Internal server error" })
  @Get("youtube/callback")
  async youtubeCallback(
    @Query("code") code: string,
    @Query("state") state: string,
    @Res() res: Response,
  ) {
    try {
      if (!code) {
        return ResponseUtil.error(
          res,
          HttpStatus.BAD_REQUEST,
          "No authorization code received",
        );
      }

      const response =
        await this.authService.exchangeCodeForYouTubeAccessToken(code);

      const redirectUrl = new URL("https://groreels.com/auth/youtube/callback");
      redirectUrl.searchParams.set("youtube_connected", "true");
      redirectUrl.searchParams.set("accessToken", response.accessToken);
      if (response.refreshToken) {
        redirectUrl.searchParams.set("refreshToken", response.refreshToken);
        redirectUrl.searchParams.set("success", "true");
      }
      console.log("Redirecting to:", redirectUrl.toString());
      return res.redirect(redirectUrl.toString());
    } catch (error) {
      console.error("Error in YouTube callback:", error);
      return ResponseUtil.error(res, HttpStatus.BAD_REQUEST, error.message);
    }
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: "Validate YouTube access token" })
  @ApiResponse({ status: 200, description: "YouTube token validation result" })
  @ApiResponse({ status: 401, description: "Unauthorized" })
  @ApiResponse({ status: 400, description: "Bad request" })
  @Get("youtube/validate")
  @UseGuards(JwtAuthGuard)
  async validateYouTubeToken(
    @Res() res: Response,
    @Req() req: AuthenticatedRequest,
  ) {
    try {
      const user = req.user;
      console.log("User from validateYouTubeToken:", user);

      const userId = user.userId;

      if (!userId) {
        return ResponseUtil.error(
          res,
          HttpStatus.UNAUTHORIZED,
          "User ID not found in token",
        );
      }

      const isValid = await this.authService.validateYouTubeAccessToken(userId);

      return ResponseUtil.success(
        res,
        HttpStatus.OK,
        { isValid },
        isValid ? "YouTube token is valid" : "YouTube token is invalid",
      );
    } catch (error) {
      console.error("Error validating YouTube token:", error);
      return ResponseUtil.error(res, HttpStatus.BAD_REQUEST, error.message);
    }
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: "Get YouTube profile" })
  @ApiResponse({ status: 200, description: "YouTube profile retrieved" })
  @ApiResponse({ status: 400, description: "No YouTube access token found" })
  @Get("youtube/profile")
  @UseGuards(JwtAuthGuard)
  async getYouTubeProfile(@Res() res: Response) {
    try {
      const user = res.locals.user;
      if (!user.youtubeAccessToken) {
        return ResponseUtil.error(
          res,
          HttpStatus.BAD_REQUEST,
          "No YouTube access token found",
        );
      }

      const profile = await this.authService.getYouTubeProfile(
        user.youtubeAccessToken,
      );

      return ResponseUtil.success(
        res,
        HttpStatus.OK,
        { profile },
        "YouTube profile retrieved successfully",
      );
    } catch (error) {
      return ResponseUtil.error(res, HttpStatus.BAD_REQUEST, error.message);
    }
  }

  @ApiOperation({ summary: "Instagram callback (Business Login 2025+)" })
  @ApiResponse({ status: 200, description: "Instagram connected successfully" })
  @ApiResponse({ status: 500, description: "Internal server error" })
  @Get("instagram/callback")
  async instagramCallback(
    @Query() query: any,
    @Res() res: Response,
    @Req() req: Request,
  ) {
    console.log("---- Instagram Callback Debug ----");
    console.log("Full query params:", query);
    console.log("Original URL:", req.originalUrl);

    const { code, state, error, success, instagram_connected } = query;
    console.log("Received Instagram authorization code:", code);
    console.log("Received state:", state);

    if (error) {
      console.error("Instagram OAuth error:", error);
      return res.redirect(`https://groreels.com/profile?error=${error}`);
    }

    // If this is the success callback from frontend, just redirect
    if (success === "true" && instagram_connected === "true") {
      console.log(
        "Success callback detected - this is the second request from frontend",
      );
      console.log("Redirecting to profile page...");
      return res.redirect(
        `https://groreels.com/profile?success=true&instagram_connected=true`,
      );
    }

    try {
      if (!code) {
        console.error("No authorization code received from Instagram");
        return res.redirect(`https://groreels.com/profile?error=no_auth_code`);
      }

      // Step 1: Exchange code for tokens
      console.log("Exchanging code for tokens...");
      const tokens =
        await this.authService.exchangeCodeForInstagramBusinessAccessToken(
          code,
        );

      console.log("Tokens received:", {
        shortLived: {
          user_id: tokens.shortLived.user_id,
          access_token: tokens.shortLived.access_token ? "[REDACTED]" : null,
        },
        longLived: {
          access_token: tokens.longLived.access_token ? "[REDACTED]" : null,
          expires_in: tokens.longLived.expires_in,
        },
      });

      // Step 2: Store the long-lived token and create/update user
      const igUserId = String(tokens.shortLived.user_id);
      console.log("Instagram User ID (as string):", igUserId);

      const user =
        await this.authService.connectOrRegisterInstagramBusinessUser(
          igUserId,
          tokens.longLived.access_token,
          tokens.longLived.expires_in,
        );

      console.log("User created/updated:", {
        id: user._id,
        instagramId: user.instagramId,
        email: user.email,
      });

      // Step 3: Issue platform tokens
      const tokenPair = await this.authService.login(user);
      console.log("Platform tokens generated successfully");

      console.log("Platform JWT access token:", tokenPair.accessToken);
      console.log("Platform JWT refresh token:", tokenPair.refreshToken);
      console.log("Expires in:", tokenPair.expires_in);

      // Step 4: Redirect with tokens
      const redirectUrl = new URL(
        "https://groreels.com/auth/instagram/callback",
      );
      redirectUrl.searchParams.set("success", "true");
      redirectUrl.searchParams.set("instagram_connected", "true");
      redirectUrl.searchParams.set("accessToken", tokenPair.accessToken);
      redirectUrl.searchParams.set("refreshToken", tokenPair.refreshToken);
      redirectUrl.searchParams.set("expiresIn", tokenPair.expires_in);

      console.log("Redirecting to frontend with tokens");
      return res.redirect(redirectUrl.toString());
    } catch (error) {
      console.error("Error in Instagram callback:", error);

      if (error.response?.data) {
        console.error("Error response data:", error.response.data);
      }

      const errorMsg = error.message || "instagram_connection_failed";
      return res.redirect(
        `https://groreels.com/profile?error=${encodeURIComponent(errorMsg)}`,
      );
    }
  }

  @ApiOperation({ summary: "Instagram Business Login (2025+)" })
  @ApiResponse({
    status: 302,
    description: "Redirect to Instagram Business authorization",
  })
  @Get("instagram")
  @Redirect()
  instagramLogin() {
    const clientId = this.configService.get<string>("INSTAGRAM_CLIENT_ID");
    const redirectUri = "https://uat.groreels.com/auth/instagram/callback";
    // Add all required scopes for content publishing and page access
    const scope = [
      "instagram_business_basic",
      "instagram_business_content_publish",
    ].join(",");
    const responseType = "code";
    const state = uuidv4();

    const url = `https://www.instagram.com/oauth/authorize?force_reauth=true&client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}&response_type=${responseType}&state=${state}`;

    console.log("Instagram Business OAuth URL:", url);
    return { url };
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: "Force refresh Instagram token for current user" })
  @ApiResponse({ status: 200, description: "Instagram token force-refreshed" })
  @ApiResponse({
    status: 400,
    description: "No Instagram refresh token found for user",
  })
  @ApiResponse({ status: 401, description: "User ID not found in token" })
  @ApiResponse({ status: 500, description: "Internal server error" })
  @Post("force-refresh-instagram-token")
  @UseGuards(JwtAuthGuard)
  async forceRefreshInstagramToken(
    @Res() res: Response,
    @Req() req: AuthenticatedRequest,
  ) {
    try {
      const userId = req.user?.userId || req.user?._id;
      if (!userId) {
        return ResponseUtil.error(
          res,
          HttpStatus.UNAUTHORIZED,
          "User ID not found in token",
        );
      }
      const newAccessToken =
        await this.authService.refreshInstagramAccessToken(userId);
      return ResponseUtil.success(
        res,
        HttpStatus.OK,
        { accessToken: newAccessToken },
        "Instagram token force-refreshed",
      );
    } catch (error) {
      return ResponseUtil.error(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        error.message,
      );
    }
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: "Test refresh YouTube tokens (manual trigger)" })
  @ApiResponse({
    status: 200,
    description: "YouTube token refresh job executed",
  })
  @ApiResponse({ status: 500, description: "Internal server error" })
  @Post("test-refresh-youtube-tokens")
  @UseGuards(JwtAuthGuard)
  async testRefreshYouTubeTokens(@Res() res: Response) {
    try {
      await this.authService.autoRefreshExpiringYouTubeTokens();
      return ResponseUtil.success(
        res,
        HttpStatus.OK,
        null,
        "YouTube token refresh job executed",
      );
    } catch (error) {
      return ResponseUtil.error(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        error.message,
      );
    }
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: "Force refresh TikTok token for current user" })
  @ApiResponse({ status: 200, description: "TikTok token force-refreshed" })
  @ApiResponse({
    status: 400,
    description: "No TikTok refresh token found for user",
  })
  @ApiResponse({ status: 401, description: "User ID not found in token" })
  @ApiResponse({ status: 500, description: "Internal server error" })
  @Post("test-refresh-tiktok-tokens")
  @UseGuards(JwtAuthGuard)
  async forceRefreshTikTokToken(
    @Res() res: Response,
    @Req() req: AuthenticatedRequest,
  ) {
    try {
      const userId = req.user?.userId || req.user?._id;
      if (!userId) {
        return ResponseUtil.error(
          res,
          HttpStatus.UNAUTHORIZED,
          "User ID not found in token",
        );
      }
      const user = await this.authService.findUserByEmail(req.user.email); // Assuming user is found by email
      if (!user.TiktokRefreshToken) {
        return ResponseUtil.error(
          res,
          HttpStatus.BAD_REQUEST,
          "No TikTok refresh token found for user",
        );
      }
      await this.authService.refreshTikTokAccessToken(user.TiktokRefreshToken);
      await this.authService.updateUserLastTokenRefresh(user._id as string);
      return ResponseUtil.success(
        res,
        HttpStatus.OK,
        null,
        "TikTok token force-refreshed",
      );
    } catch (error) {
      return ResponseUtil.error(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        error.message,
      );
    }
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: "Force refresh YouTube token for current user" })
  @ApiResponse({ status: 200, description: "YouTube token force-refreshed" })
  @ApiResponse({
    status: 400,
    description: "No YouTube refresh token found for user",
  })
  @ApiResponse({ status: 401, description: "User ID not found in token" })
  @ApiResponse({ status: 500, description: "Internal server error" })
  @Post("force-refresh-youtube-token")
  @UseGuards(JwtAuthGuard)
  async forceRefreshYouTubeToken(
    @Res() res: Response,
    @Req() req: AuthenticatedRequest,
  ) {
    try {
      const userId = req.user?.userId || req.user?._id;
      if (!userId) {
        return ResponseUtil.error(
          res,
          HttpStatus.UNAUTHORIZED,
          "User ID not found in token",
        );
      }
      const user = await this.authService.findUserByEmail(req.user.email); // Assuming user is found by email
      if (!user.youtubeRefreshToken) {
        return ResponseUtil.error(
          res,
          HttpStatus.BAD_REQUEST,
          "No YouTube refresh token found for user",
        );
      }
      const newAccessToken = await this.authService.refreshYouTubeAccessToken(
        user._id as string,
      );
      await this.authService.updateUserLastTokenRefresh(user._id as string);
      return ResponseUtil.success(
        res,
        HttpStatus.OK,
        { accessToken: newAccessToken },
        "YouTube token force-refreshed",
      );
    } catch (error) {
      return ResponseUtil.error(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        error.message,
      );
    }
  }

  /**
   * Instagram Deauthorize Callback
   * This endpoint is called by Instagram when a user deauthorizes the app.
   * You must remove/deactivate the user's data here.
   */
  @Post("instagram/deauthorize")
  async instagramDeauthorize(@Body() body: any, @Res() res: Response) {
    try {
      const userId = body.user_id;
      if (userId) {
        await this.authService.deauthorizeInstagramUser(userId);
      }
      return res.status(200).json({ success: true });
    } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * Instagram Data Deletion Request
   * This endpoint is called by Instagram when a user requests data deletion.
   * You must process the request and return a status URL and confirmation code.
   */
  @Get("instagram/data-deletion")
  async instagramDataDeletion(
    @Query("signed_request") signedRequest: string,
    @Res() res: Response,
  ) {
    try {
      const confirmation =
        await this.authService.handleInstagramDataDeletion(signedRequest);
      // Provide a status URL (could be a static page or an endpoint)
      const url = "https://uat.groreels.com/data-deletion-status";
      return res.json({
        url,
        confirmation_code: confirmation.confirmationCode,
      });
    } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: "Debug email service" })
  @ApiResponse({ status: 200, description: "Email service status" })
  @Get("debug/email")
  async debugEmail(@Res() res: Response) {
    try {
      const emailStatus = this.authService.getEmailServiceStatus();
      const isAvailable = this.authService.isEmailServiceAvailable();

      return ResponseUtil.success(res, HttpStatus.OK, {
        emailStatus,
        isAvailable,
      });
    } catch (error) {
      return ResponseUtil.error(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        error.message,
      );
    }
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: "Debug user password" })
  @ApiResponse({ status: 200, description: "User password info" })
  @Post("debug/user-password")
  async debugUserPassword(
    @Body() body: { email: string },
    @Res() res: Response,
  ) {
    try {
      const result = await this.authService.debugUserPassword(body.email);

      return ResponseUtil.success(res, HttpStatus.OK, result);
    } catch (error) {
      return ResponseUtil.error(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        error.message,
      );
    }
  }
}
