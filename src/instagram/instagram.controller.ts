import { Controller, Post, Body, UseGuards, Req, Get, Param, UseInterceptors, UploadedFile } from '@nestjs/common';
import { InstagramService } from './instagram.service';
import { CreateInstagramPostDto } from './dto/create-instagram-post.dto';
import { ScheduleInstagramPostDto } from './dto/schedule-instagram-post.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { S3Service } from '../s3/s3.service';
import { FileInterceptor } from '@nestjs/platform-express';
import * as multer from 'multer';
import axios from 'axios';

@Controller('instagram')
export class InstagramController {
  constructor(
    private readonly instagramService: InstagramService,
    private readonly s3Service: S3Service,
  ) { }

  @UseGuards(JwtAuthGuard)
  @Post('post')
  async postToInstagram(@Req() req, @Body() dto: CreateInstagramPostDto) {
    const userId = req.user?.userId || req.user?._id;
    try {
      return await this.instagramService.postToInstagram(userId, dto);
    } catch (err) {
      if (err.code && err.userMessage) {
        return {
          error: true,
          code: err.code,
          subcode: err.subcode,
          title: err.userTitle,
          message: err.userMessage,
          recommendedAction: err.recommendedAction,
        };
      }
      throw err;
    }
  }

  @UseGuards(JwtAuthGuard)
  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { storage: multer.memoryStorage() }))
  async uploadInstagramFile(
    @Req() req,
    @UploadedFile() file: any, // Fix: use 'any' to avoid linter error
    @Body() dto: Omit<CreateInstagramPostDto, 'mediaUrl'>,
  ) {
    const userId = req.user?.userId || req.user?._id;
    if (!file) {
      return {
        error: true,
        message: 'No file uploaded',
      };
    }
    try {
      // Upload to S3
      const mediaUrl = await this.s3Service.uploadMedia(userId, file);
      // Call your Instagram posting logic with the S3 URL
      return await this.instagramService.postToInstagram(userId, { ...dto, mediaUrl });
    } catch (err) {
      if (err.code && err.userMessage) {
        return {
          error: true,
          code: err.code,
          subcode: err.subcode,
          title: err.userTitle,
          message: err.userMessage,
          recommendedAction: err.recommendedAction,
        };
      }
      throw err;
    }
  }

  @UseGuards(JwtAuthGuard)
  @Post('carousel')
  async postCarousel(@Req() req, @Body() body: { items: CreateInstagramPostDto[], caption?: string }) {
    const userId = req.user?.userId || req.user?._id;
    try {
      return await this.instagramService.postCarouselToInstagram(userId, body.items, body.caption);
    } catch (err) {
      if (err.code && err.userMessage) {
        return {
          error: true,
          code: err.code,
          subcode: err.subcode,
          title: err.userTitle,
          message: err.userMessage,
          recommendedAction: err.recommendedAction,
        };
      }
      throw err;
    }
  }

  @UseGuards(JwtAuthGuard)
  @Get('status/:containerId')
  async getStatus(@Req() req, @Param('containerId') containerId: string) {
    const userId = req.user?.userId || req.user?._id;
    try {
      return await this.instagramService.getMediaStatus(userId, containerId);
    } catch (err) {
      if (err.code && err.userMessage) {
        return {
          error: true,
          code: err.code,
          subcode: err.subcode,
          title: err.userTitle,
          message: err.userMessage,
          recommendedAction: err.recommendedAction,
        };
      }
      throw err;
    }
  }

  @UseGuards(JwtAuthGuard)
  @Post('schedule')
  async scheduleInstagramPost(@Req() req, @Body() dto: ScheduleInstagramPostDto) {
    const userId = req.user?.userId || req.user?._id;
    return this.instagramService.scheduleInstagramPost(userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('validate-token')
  async validateInstagramToken(@Req() req) {
    const userId = req.user?.userId || req.user?._id;
    if (!userId) {
      return {
        error: true,
        message: 'User not found in request.'
      };
    }
    // Fetch user from DB to get Instagram token and ID
    const user = await this.instagramService['usersService'].findById(userId);
    if (!user || !user.instagramAccessToken || !user.instagramId) {
      return {
        error: true,
        message: 'Instagram account not connected.'
      };
    }
    const validation = await this.instagramService['tokenValidator'].validateToken(
      user.instagramAccessToken,
      user.instagramId
    );
    // Try to fetch token info from the Graph API's /debug_token endpoint
    let debugInfo = null;
    try {
      // You need an app access token for this endpoint: {app-id}|{app-secret}
      const appId = process.env.INSTAGRAM_CLIENT_ID || process.env.FB_APP_ID;
      const appSecret = process.env.INSTAGRAM_CLIENT_SECRET || process.env.FB_APP_SECRET;
      const appToken = `${appId}|${appSecret}`;
      const debugRes = await axios.get('https://graph.facebook.com/debug_token', {
        params: {
          input_token: user.instagramAccessToken,
          access_token: appToken
        }
      });
      debugInfo = debugRes.data.data;
    } catch (e) {
      // Ignore debug errors, just log
      console.warn('Could not fetch token debug info:', e?.response?.data || e.message);
    }
    // Extract scopes and token type if available
    const scopes = debugInfo?.scopes || [];
    const tokenType = debugInfo?.type || validation.tokenType;
    // Check for required scopes for posting/messaging
    const requiredScopes = ['instagram_basic', 'instagram_content_publish'];
    const missingScopes = requiredScopes.filter(scope => !scopes.includes(scope));
    if (!validation.isValid) {
      return {
        valid: false,
        error: validation.error,
        tokenType,
        scopes,
        message: validation.error || 'Instagram token validation failed.',
        recommendedAction: validation.tokenType === 'jwt'
          ? 'Reconnect using a web login or enable ATT on iOS.'
          : 'Reconnect your Instagram account.'
      };
    }
    if (missingScopes.length > 0) {
      return {
        valid: false,
        tokenType,
        scopes,
        message: `Your token is missing required permissions: ${missingScopes.join(', ')}.`,
        recommendedAction: 'Reconnect your Instagram account and grant all requested permissions.'
      };
    }
    return {
      valid: true,
      tokenType,
      scopes,
      message: 'Instagram token is valid and has required permissions.'
    };
  }
}
