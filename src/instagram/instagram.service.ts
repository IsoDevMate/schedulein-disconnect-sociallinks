import { Injectable } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import axios from 'axios';
import { CreateInstagramPostDto, InstagramMediaType } from './dto/create-instagram-post.dto';
import { ScheduleInstagramPostDto } from './dto/schedule-instagram-post.dto';
import { mapInstagramApiError } from './instagram-error.util';
import { InstagramTokenValidatorService } from './instagram-token-validator.service';

@Injectable()
export class InstagramService {
  constructor(
    private readonly usersService: UsersService,
    private readonly tokenValidator: InstagramTokenValidatorService,
  ) {}

  private async getInstagramAuth(userId: string) {
    const user = await this.usersService.findById(userId);
    console.log('Fetched user for Instagram auth:', user);
    if (!user || !user.instagramId || !user.instagramAccessToken) {
      throw new Error('Instagram account not connected');
    }
    console.log('Using Instagram access token:', user.instagramAccessToken);

    // Fetch Facebook Pages for the user
    const pagesRes = await axios.get(
      `https://graph.facebook.com/v19.0/me/accounts?access_token=${user.instagramAccessToken}`
    );
    const pages = pagesRes.data.data;
    // Find the page connected to the Instagram account
    let pageWithIg = null;
    for (const page of pages) {
      try {
        const igRes = await axios.get(
          `https://graph.facebook.com/v19.0/${page.id}?fields=instagram_business_account&access_token=${page.access_token}`
        );
        if (
          igRes.data.instagram_business_account &&
          igRes.data.instagram_business_account.id === user.instagramId
        ) {
          pageWithIg = page;
          break;
        }
      } catch (err) {
        // Ignore and continue
        continue;
      }
    }
    if (!pageWithIg) {
      throw new Error('No connected Facebook Page found for this Instagram account.');
    }
    const pageAccessToken = pageWithIg.access_token;
    console.log('Using Facebook Page access token for posting:', pageAccessToken);

    // Validate the page access token (optional, can reuse your validator if needed)
    const validation = await this.tokenValidator.validateToken(pageAccessToken, user.instagramId);
    if (!validation.isValid) {
      throw new Error(validation.error || 'Instagram token validation failed.');
    }

    return {
      igUserId: user.instagramId,
      accessToken: pageAccessToken, // Use this for posting!
    };
  }

  // Add method to verify token validity
  private async verifyTokenValidity(accessToken: string): Promise<boolean> {
    console.log('Verifying Instagram access token:', accessToken);
    try {
      const response = await axios.get(
        `https://graph.instagram.com/me?fields=id,username&access_token=${accessToken}`
      );
      console.log('Token verification response:', response.data);
      return response.status === 200;
    } catch (error) {
      console.error('Token verification failed:', error.response?.data);
      return false;
    }
  }

  async postToInstagram(userId: string, dto: CreateInstagramPostDto) {
    try {
      const { igUserId, accessToken } = await this.getInstagramAuth(userId);

      // Verify token before proceeding
      const isTokenValid = await this.verifyTokenValidity(accessToken);
      if (!isTokenValid) {
        throw new Error('Instagram access token is invalid. Please reconnect your account.');
      }

      console.log('Posting to Instagram with:', {
        igUserId,
        mediaType: dto.mediaType,
        mediaUrl: dto.mediaUrl,
        caption: dto.caption?.substring(0, 50) + '...' // Log first 50 chars
      });

      // 1. Create media container
      const mediaPayload: any = {
        caption: dto.caption,
      };

      if (dto.mediaType === InstagramMediaType.IMAGE) {
        mediaPayload.image_url = dto.mediaUrl;
      } else if (dto.mediaType === InstagramMediaType.VIDEO) {
        mediaPayload.video_url = dto.mediaUrl;
      } else if (dto.mediaType === InstagramMediaType.REEL) {
        mediaPayload.media_type = 'REELS';
        mediaPayload.video_url = dto.mediaUrl;
      }

      console.log('Creating media container with payload:', mediaPayload);

      const createMediaRes = await axios.post(
        `https://graph.facebook.com/v19.0/${igUserId}/media`,
        mediaPayload,
        { params: { access_token: accessToken } }
      );

      const containerId = createMediaRes.data.id;
      console.log('Media container created:', containerId);

      // 2. Publish media
      const publishRes = await axios.post(
        `https://graph.facebook.com/v19.0/${igUserId}/media_publish`,
        { creation_id: containerId },
        { params: { access_token: accessToken } }
      );

      console.log('Media published successfully:', publishRes.data);
      return publishRes.data;
    } catch (error) {
      console.error('Instagram posting error:', error.response?.data || error.message);

      // Detect JWT token error and return user-friendly message
      if (error.message && error.message.includes('limited token')) {
        return {
          error: true,
          code: 'LIMITED_LOGIN_TOKEN',
          message: error.message,
          recommendedAction: 'Reconnect your Instagram account using a web login or enable App Tracking Transparency on iOS.'
        };
      }

      const igError = error.response?.data?.error;
      if (igError) {
        throw mapInstagramApiError(igError);
      }
      throw new Error(error.message);
    }
  }

  async postCarouselToInstagram(userId: string, mediaItems: CreateInstagramPostDto[], caption?: string) {
    try {
      const { igUserId, accessToken } = await this.getInstagramAuth(userId);

      // Verify token before proceeding
      const isTokenValid = await this.verifyTokenValidity(accessToken);
      if (!isTokenValid) {
        throw new Error('Instagram access token is invalid. Please reconnect your account.');
      }

      // 1. Create containers for each item
      const containerIds: string[] = [];
      for (const item of mediaItems) {
        const payload: any = { caption: item.caption, is_carousel_item: true };
        if (item.mediaType === InstagramMediaType.IMAGE) {
          payload.image_url = item.mediaUrl;
        } else if (item.mediaType === InstagramMediaType.VIDEO) {
          payload.video_url = item.mediaUrl;
        }
        const res = await axios.post(
          `https://graph.facebook.com/v19.0/${igUserId}/media`,
          payload,
          { params: { access_token: accessToken } }
        );
        containerIds.push(res.data.id);
      }

      // 2. Create carousel container
      const carouselRes = await axios.post(
        `https://graph.facebook.com/v19.0/${igUserId}/media`,
        {
          media_type: 'CAROUSEL',
          children: containerIds,
          caption,
        },
        { params: { access_token: accessToken } }
      );

      const carouselContainerId = carouselRes.data.id;

      // 3. Publish carousel
      const publishRes = await axios.post(
        `https://graph.facebook.com/v19.0/${igUserId}/media_publish`,
        { creation_id: carouselContainerId },
        { params: { access_token: accessToken } }
      );

      return publishRes.data;
    } catch (error) {
      const igError = error.response?.data?.error;
      if (igError) {
        throw mapInstagramApiError(igError);
      }
      throw new Error(error.message);
    }
  }

  async getMediaStatus(userId: string, containerId: string) {
    try {
      const { accessToken } = await this.getInstagramAuth(userId);
      const statusRes = await axios.get(
        `https://graph.facebook.com/v19.0/${containerId}?fields=status_code`,
        { params: { access_token: accessToken } }
      );
      return statusRes.data;
    } catch (error) {
      const igError = error.response?.data?.error;
      if (igError) {
        throw mapInstagramApiError(igError);
      }
      throw new Error(error.message);
    }
  }

  async scheduleInstagramPost(userId: string, dto: ScheduleInstagramPostDto) {
    // TODO: Implement scheduling logic (store in DB, schedule job)
    return { message: 'Stub: Schedule Instagram post', userId, dto };
  }

  async getInstagramProfile(userId: string) {
    // TODO: Fetch Instagram profile using stored access token
    return { message: 'Stub: Get Instagram profile', userId };
  }
}
