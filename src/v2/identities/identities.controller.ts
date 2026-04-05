import { Controller, Get, Post, UseGuards, Request, Body, Param, Query, Res, Redirect, BadRequestException } from "@nestjs/common";
import { Response } from "express";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiParam,
} from "@nestjs/swagger";
import { IdentitiesService } from "./identities.service";
import { V2JwtAuthGuard } from "../account-connect/guards/v2-jwt-auth.guard";
import { CreateIdentityDto, EmailRegistrationDto, EmailLoginDto, IdentityPlatform } from "./dto/create-identity.dto";
import { UserIdentityResponseDto } from "./dto/identity-response.dto";
// Removed CreateIdentityRequest import - not needed for simple approach

@ApiTags("v2-identities")
@Controller("v2/identities")
export class IdentitiesController {
  constructor(private readonly identitiesService: IdentitiesService) {}

  // ===== PUBLIC ENDPOINTS (No Auth Required) =====

  @Post("register")
  @ApiOperation({
    summary: "Register new user with email",
    description: "Create a new user account with email and password. Email verification is required before the account becomes active. Returns verification status and next steps."
  })
  @ApiResponse({
    status: 201,
    description: "User registered successfully, email verification required"
  })
  @ApiResponse({
    status: 400,
    description: "Invalid request data"
  })
  @ApiResponse({
    status: 409,
    description: "User already exists"
  })
  async registerWithEmail(@Body() emailRegistrationDto: EmailRegistrationDto) {
    return this.identitiesService.registerWithEmail(emailRegistrationDto);
  }

  @Post("login")
  @ApiOperation({
    summary: "Login with email and password",
    description: "Authenticate user with email and password. Returns JWT access token and refresh token. Email must be verified before login is allowed."
  })
  @ApiResponse({
    status: 200,
    description: "Login successful"
  })
  @ApiResponse({
    status: 401,
    description: "Invalid credentials"
  })
  @ApiResponse({
    status: 400,
    description: "Email not verified"
  })
  async loginWithEmail(@Body() loginDto: EmailLoginDto) {
    return this.identitiesService.loginWithEmail(loginDto.email, loginDto.password);
  }

  // ===== OAUTH REGISTRATION ENDPOINTS =====

  @Get("tiktok")
  @ApiOperation({
    summary: "TikTok OAuth registration",
    description: "Initiate TikTok OAuth flow for user registration. Redirects to TikTok authorization page where user grants permissions to access their account."
  })
  @ApiResponse({ status: 302, description: "Redirect to TikTok authorization" })
  @Redirect()
  tiktokRegister() {
    return this.identitiesService.getTikTokAuthUrl();
  }

  @Get("tiktok/callback")
  @ApiOperation({
    summary: "TikTok OAuth callback",
    description: "Handle TikTok OAuth callback after user authorization. Creates or updates user account with TikTok profile information and returns access tokens."
  })
  @ApiResponse({ status: 200, description: "TikTok registration successful" })
  async tiktokCallback(@Query("code") code: string, @Query("state") state: string, @Res() res: Response) {
    try {
      const result = await this.identitiesService.handleTikTokCallback(code, state);
      console.log('TikTok callback result:', result);
      return res.redirect(`https://groreels.com/auth/tiktok/callback?success=true&accessToken=${result.accessToken}&refreshToken=${result.refreshToken}`);
    } catch (error) {
      return res.redirect(`https://groreels.com/auth/tiktok/callback?error=${encodeURIComponent(error.message)}`);
    }
  }

  @Get("instagram")
  @ApiOperation({ summary: "Instagram OAuth registration (v2)" })
  @ApiResponse({ status: 302, description: "Redirect to Instagram authorization" })
  @Redirect()
  instagramRegister() {
    return this.identitiesService.getInstagramAuthUrl();
  }

  @Get("instagram/callback")
  @ApiOperation({ summary: "Instagram OAuth callback (v2)" })
  @ApiResponse({ status: 200, description: "Instagram registration successful" })
  async instagramCallback(@Query("code") code: string, @Query("state") state: string, @Res() res: Response) {
    try {
      const result = await this.identitiesService.handleInstagramCallback(code, state);
      console.log('Instagram callback result:', result);
      return res.redirect(`https://groreels.com/auth/instagram/callback?success=true&accessToken=${result.accessToken}&refreshToken=${result.refreshToken}`);
    } catch (error) {
      return res.redirect(`https://groreels.com/auth/instagram/callback?error=${encodeURIComponent(error.message)}`);
    }
  }

  @Get("youtube")
  @ApiOperation({ summary: "YouTube OAuth registration (v2)" })
  @ApiResponse({ status: 302, description: "Redirect to YouTube authorization" })
  @Redirect()
  youtubeRegister() {
    return this.identitiesService.getYouTubeAuthUrl();
  }

  @Get("youtube/callback")
  @ApiOperation({ summary: "YouTube OAuth callback (v2)" })
  @ApiResponse({ status: 200, description: "YouTube registration successful" })
  async youtubeCallback(@Query("code") code: string, @Query("state") state: string, @Res() res: Response) {
    try {
      const result = await this.identitiesService.handleYouTubeCallback(code, state);
      console.log('YouTube callback result:', result);
      return res.redirect(`https://groreels.com/auth/youtube/callback?success=true&accessToken=${result.accessToken}&refreshToken=${result.refreshToken}`);
    } catch (error) {
      return res.redirect(`https://groreels.com/auth/youtube/callback?error=${encodeURIComponent(error.message)}`);
    }
  }

  // ===== MANAGEMENT OAUTH ENDPOINTS =====

  @Get("tiktok/management")
  @ApiOperation({ summary: "TikTok OAuth management authorization (v2)" })
  @ApiResponse({ status: 302, description: "Redirect to TikTok management authorization" })
  @Redirect()
  tiktokManagement() {
    return this.identitiesService.getTikTokManagementAuthUrl();
  }

  @Get("tiktok/management/callback")
  @ApiOperation({ summary: "TikTok OAuth management callback (v2)" })
  @ApiResponse({ status: 200, description: "TikTok management authorization successful" })
  async tiktokManagementCallback(@Query("code") code: string, @Query("state") state: string, @Res() res: Response) {
    try {
      const result = await this.identitiesService.handleTikTokManagementCallback(code, state);
      console.log('TikTok management callback result:', result);

      // Include profile data in the redirect URL
      const profileData = encodeURIComponent(JSON.stringify(result.profile));
      return res.redirect(`https://groreels.com/auth/tiktok/management/callback?success=true&accessToken=${result.accessToken}&refreshToken=${result.refreshToken}&tiktokAccessToken=${result.tiktokAccessToken}&tiktokRefreshToken=${result.tiktokRefreshToken}&profile=${profileData}`);
    } catch (error) {
      return res.redirect(`https://groreels.com/auth/tiktok/management/callback?error=${encodeURIComponent(error.message)}`);
    }
  }


  @Get("youtube/management")
  @ApiOperation({ summary: "YouTube OAuth management authorization (v2)" })
  @ApiResponse({ status: 302, description: "Redirect to YouTube management authorization" })
  @Redirect()
  youtubeManagement() {
    return this.identitiesService.getYouTubeManagementAuthUrl();
  }

  @Get("youtube/management/callback")
  @ApiOperation({ summary: "YouTube OAuth management callback (v2)" })
  @ApiResponse({ status: 200, description: "YouTube management authorization successful" })
  async youtubeManagementCallback(@Query("code") code: string, @Query("state") state: string, @Res() res: Response) {
    try {
      const result = await this.identitiesService.handleYouTubeManagementCallback(code, state);
      console.log('YouTube management callback result:', result);

      // Include profile data in the redirect URL
      const profileData = encodeURIComponent(JSON.stringify(result.profile));
      return res.redirect(`https://groreels.com/auth/youtube/management/callback?success=true&accessToken=${result.accessToken}&refreshToken=${result.refreshToken}&youtubeAccessToken=${result.youtubeAccessToken}&youtubeRefreshToken=${result.youtubeRefreshToken}&profile=${profileData}`);
    } catch (error) {
      return res.redirect(`https://groreels.com/auth/youtube/management/callback?error=${encodeURIComponent(error.message)}`);
    }
  }

  @Get("linkedin")
  @ApiOperation({ summary: "LinkedIn OAuth registration (v2)" })
  @ApiResponse({ status: 302, description: "Redirect to LinkedIn authorization" })
  @Redirect()
  linkedinRegister() {
    return this.identitiesService.getLinkedInAuthUrl();
  }

  @Get("linkedin/callback")
  @ApiOperation({ summary: "LinkedIn OAuth callback (v2)" })
  @ApiResponse({ status: 200, description: "LinkedIn registration successful" })
  async linkedinCallback(@Query("code") code: string, @Query("state") state: string, @Res() res: Response) {
    try {
      const result = await this.identitiesService.handleLinkedInCallback(code, state);
      console.log('LinkedIn callback result:', result);
      return res.redirect(`https://groreels.com/auth/linkedin/callback?success=true&accessToken=${result.accessToken}&refreshToken=${result.refreshToken}`);
    } catch (error) {
      return res.redirect(`https://groreels.com/auth/linkedin/callback?error=${encodeURIComponent(error.message)}`);
    }
  }

  // ===== PROTECTED ENDPOINTS (Auth Required) =====
  // These are for existing users managing their identities

  @Get("me")
  @UseGuards(V2JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get current user and linked identities" })
  @ApiResponse({
    status: 200,
    description: "Current user identities",
    type: UserIdentityResponseDto
  })
  async me(@Request() req) {
    return this.identitiesService.getMe(req.user.sub || req.user.id);
  }

  @Post("link")
  @UseGuards(V2JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Link additional identity to existing user" })
  @ApiResponse({
    status: 201,
    description: "Identity successfully linked"
  })
  @ApiResponse({
    status: 400,
    description: "Invalid request data"
  })
  @ApiResponse({
    status: 409,
    description: "Identity already exists for this platform"
  })
  async linkIdentity(@Request() req, @Body() createIdentityDto: CreateIdentityDto) {
    return this.identitiesService.createIdentity(req.user.sub || req.user.id, createIdentityDto);
  }

  @Get("validate/:platform")
  @ApiOperation({ summary: "Validate an existing identity token" })
  @ApiParam({ name: 'platform', enum: IdentityPlatform, description: 'Platform to validate' })
  @ApiResponse({
    status: 200,
    description: "Identity validation result"
  })
  @ApiResponse({
    status: 404,
    description: "Identity not found"
  })
  async validateIdentity(@Request() req, @Param('platform') platform: IdentityPlatform) {
    return this.identitiesService.validateIdentity(req.user.sub || req.user.id, platform);
  }

  // @Post("refresh-profile")
  // @UseGuards(JwtAuthGuard)
  // @ApiBearerAuth()
  // @ApiOperation({ summary: "Refresh minimal identity profile if available" })
  // @ApiResponse({ status: 200, description: "Refreshed or cached identity profile returned" })
  // async refresh(@Request() req) {
  //   // v2: keep identity minimal; return cached for now
  //   return this.identitiesService.getMe(req.user.sub || req.user.id);
  // }

  @Post("cleanup-duplicates")
  @UseGuards(V2JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Clean up duplicate identities for current user",
    description: "Removes duplicate identities for the authenticated user and returns updated user data"
  })
  @ApiResponse({ status: 200, description: "Duplicate identities cleaned up successfully" })
  async cleanupDuplicates(@Request() req) {
    try {
      const userId = req.user.id || req.user.sub;
      await this.identitiesService.cleanupDuplicateIdentities(userId);

      // Get updated user data
      const updatedUser = await this.identitiesService.getMe(userId);

      return {
        success: true,
        message: "Duplicate identities cleaned up successfully",
        user: updatedUser
      };
    } catch (error) {
      throw new BadRequestException(`Failed to cleanup duplicates: ${error.message}`);
    }
  }

  // Removed deactivate endpoint - keeping it simple for now

  // Removed search endpoint - keeping it simple for now
}
