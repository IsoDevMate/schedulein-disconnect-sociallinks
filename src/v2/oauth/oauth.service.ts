import { Injectable, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  refreshExpiresIn?: number;
  tokenType?: string;
  scope?: string;
  userId?: string;
}

export interface OAuthProfile {
  id: string;
  subjectId: string; // Platform-specific user ID
  username?: string;
  displayName?: string;
  email?: string;
  avatar?: string;
  profilePicture?: string; // Alternative to avatar
  platform: string;
  platformData?: Record<string, any>; // Additional platform-specific data
}

@Injectable()
export class OAuthService {
  private readonly oauth2Client: OAuth2Client;
  private readonly YOUTUBE_SCOPES = [
    'https://www.googleapis.com/auth/youtube.upload',
    'https://www.googleapis.com/auth/youtube.readonly',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/userinfo.email',
    'openid',
    'email',
  ];

  constructor(private configService: ConfigService) {
    this.oauth2Client = new google.auth.OAuth2(
      this.configService.get('YOUTUBE_CLIENT_ID'),
      this.configService.get('YOUTUBE_CLIENT_SECRET'),
      this.configService.get('YOUTUBE_REDIRECT_URI_V2')
    );
  }

  /**
   * Create a YouTube OAuth2 client with the specified redirect URI
   */
  private createYouTubeOAuth2Client(redirectUri?: string): OAuth2Client {
    return new google.auth.OAuth2(
      this.configService.get('YOUTUBE_CLIENT_ID'),
      this.configService.get('YOUTUBE_CLIENT_SECRET'),
      redirectUri || this.configService.get('YOUTUBE_REDIRECT_URI_V2')
    );
  }

  // Identity flow - minimal scopes for sign-in only
  async exchangeCodeForIdentity(platform: string, code: string, redirectUri?: string): Promise<OAuthTokens> {
    switch (platform) {
      case 'tiktok':
        return this.exchangeCodeForTikTokIdentity(code, redirectUri);
      case 'instagram':
        return this.exchangeCodeForInstagramIdentity(code, redirectUri);
      case 'youtube':
        return this.exchangeCodeForYouTubeIdentity(code, redirectUri);
      case 'linkedin':
        return this.exchangeCodeForLinkedInIdentity(code, redirectUri);
      default:
        throw new BadRequestException(`Unsupported platform: ${platform}`);
    }
  }

  // Management flow - full scopes for content management
  async exchangeCodeForManagement(platform: string, code: string, redirectUri?: string): Promise<OAuthTokens> {
    switch (platform) {
      case 'tiktok':
        return this.exchangeCodeForTikTokManagement(code, redirectUri);
      case 'instagram':
        return this.exchangeCodeForInstagramManagement(code, redirectUri);
      case 'youtube':
        return this.exchangeCodeForYouTubeManagement(code, redirectUri);
      case 'linkedin':
        return this.exchangeCodeForLinkedInManagement(code, redirectUri);
      default:
        throw new BadRequestException(`Unsupported platform: ${platform}`);
    }
  }

  // TikTok Identity (minimal scopes)
  private async exchangeCodeForTikTokIdentity(code: string, redirectUri?: string): Promise<OAuthTokens> {
    try {
      const clientKey = this.configService.get<string>('TIKTOK_CLIENT_KEY');
      const clientSecret = this.configService.get<string>('TIKTOK_CLIENT_SECRET');
      const defaultRedirectUri = this.configService.get<string>('TIKTOK_REDIRECT_URI_V2') || 'https://uat.groreels.com/v2/identities/tiktok/callback';

      const response = await axios.post(
        'https://open.tiktokapis.com/v2/oauth/token/',
        new URLSearchParams({
          grant_type: 'authorization_code',
          code: code,
          redirect_uri: redirectUri || defaultRedirectUri,
          client_key: clientKey,
          client_secret: clientSecret,
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        },
      );

      return {
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token,
        expiresIn: response.data.expires_in,
        refreshExpiresIn: response.data.refresh_expires_in,
        scope: 'identity_only',
      };
    } catch (error) {
      console.error('Error exchanging code for TikTok identity token:', error);
      throw new InternalServerErrorException('Failed to exchange code for TikTok identity token');
    }
  }

  // TikTok Management (full scopes)
  private async exchangeCodeForTikTokManagement(code: string, redirectUri?: string): Promise<OAuthTokens> {
    try {
      const clientKey = this.configService.get<string>('TIKTOK_CLIENT_KEY');
      const clientSecret = this.configService.get<string>('TIKTOK_CLIENT_SECRET');
      const defaultRedirectUri = this.configService.get<string>('TIKTOK_MANAGEMENT_REDIRECT_URI_V2') || 'https://uat.groreels.com/v2/identities/tiktok/management/callback';

      const response = await axios.post(
        'https://open.tiktokapis.com/v2/oauth/token/',
        new URLSearchParams({
          grant_type: 'authorization_code',
          code: code,
          redirect_uri: redirectUri || defaultRedirectUri,
          client_key: clientKey,
          client_secret: clientSecret,
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        },
      );

      return {
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token,
        expiresIn: response.data.expires_in,
        refreshExpiresIn: response.data.refresh_expires_in,
        scope: 'full_management', // Full scope for content management
      };
    } catch (error) {
      console.error('Error exchanging code for TikTok management token:', error);
      throw new InternalServerErrorException('Failed to exchange code for TikTok management token');
    }
  }

  // YouTube Identity (minimal scopes)
  private async exchangeCodeForYouTubeIdentity(code: string, redirectUri?: string): Promise<OAuthTokens> {
    try {
      const oauth2Client = this.createYouTubeOAuth2Client(redirectUri);
      const { tokens } = await oauth2Client.getToken(code);

      if (!tokens.access_token) {
        throw new Error('No access token received');
      }

      return {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresIn: tokens.expiry_date ? Math.floor(tokens.expiry_date / 1000) : undefined,
        scope: 'identity_only', // Minimal scope for sign-in
      };
    } catch (error) {
      console.error('Error exchanging code for YouTube identity token:', error);
      throw new InternalServerErrorException('Failed to exchange code for YouTube identity token');
    }
  }

  // YouTube Management (full scopes)
  private async exchangeCodeForYouTubeManagement(code: string, redirectUri?: string): Promise<OAuthTokens> {
    try {
      // Use management redirect URI for management flows
      const oauth2Client = this.createYouTubeOAuth2Client(
        redirectUri || this.configService.get('YOUTUBE_MANAGEMENT_REDIRECT_URI_V2')
      );

      const { tokens } = await oauth2Client.getToken(code);

      if (!tokens.access_token) {
        throw new Error('No access token received');
      }

      return {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresIn: tokens.expiry_date ? Math.floor(tokens.expiry_date / 1000) : undefined,
        scope: 'full_management', // Full scope for content management
      };
    } catch (error) {
      console.error('Error exchanging code for YouTube management token:', error);
      throw new InternalServerErrorException('Failed to exchange code for YouTube management token');
    }
  }

  // Instagram Identity (minimal scopes)
  private async exchangeCodeForInstagramIdentity(code: string, redirectUri?: string): Promise<OAuthTokens> {
    try {
      const clientId = this.configService.get<string>('INSTAGRAM_CLIENT_ID');
      const clientSecret = this.configService.get<string>('INSTAGRAM_CLIENT_SECRET');
      const defaultRedirectUri = this.configService.get<string>('INSTAGRAM_REDIRECT_URI_V2') || 'https://uat.groreels.com/v2/identities/instagram/callback';

      const response = await axios.post(
        'https://api.instagram.com/oauth/access_token',
        new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: 'authorization_code',
          redirect_uri: redirectUri || defaultRedirectUri,
          code: code,
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          transformResponse: (data) => {
            const fixedData = data.replace(/"user_id":\s*(\d+)/g, '"user_id":"$1"');
            return JSON.parse(fixedData);
          },
        },
      );

      return {
        accessToken: response.data.access_token,
        userId: response.data.user_id,
        scope: 'identity_only', // Minimal scope for sign-in
      };
    } catch (error) {
      console.error('Error exchanging code for Instagram identity token:', error);
      throw new InternalServerErrorException('Failed to exchange code for Instagram identity token');
    }
  }

  // Instagram Management (full scopes)
  private async exchangeCodeForInstagramManagement(code: string, redirectUri?: string): Promise<OAuthTokens> {
    try {
      const clientId = this.configService.get<string>('INSTAGRAM_CLIENT_ID');
      const clientSecret = this.configService.get<string>('INSTAGRAM_CLIENT_SECRET');
      const defaultRedirectUri = this.configService.get<string>('INSTAGRAM_REDIRECT_URI_V2') || 'https://uat.groreels.com/v2/identities/instagram/callback';

      const response = await axios.post(
        'https://api.instagram.com/oauth/access_token',
        new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: 'authorization_code',
          redirect_uri: redirectUri || defaultRedirectUri,
          code: code,
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          transformResponse: (data) => {
            const fixedData = data.replace(/"user_id":\s*(\d+)/g, '"user_id":"$1"');
            return JSON.parse(fixedData);
          },
        },
      );

      // Exchange for long-lived token for management
      const longLivedResponse = await axios.get(
        'https://graph.instagram.com/access_token',
        {
          params: {
            grant_type: 'ig_exchange_token',
            client_secret: clientSecret,
            access_token: response.data.access_token,
          },
        },
      );

      return {
        accessToken: longLivedResponse.data.access_token,
        userId: response.data.user_id,
        expiresIn: longLivedResponse.data.expires_in,
        scope: 'full_management', // Full scope for content management
      };
    } catch (error) {
      console.error('Error exchanging code for Instagram management token:', error);
      throw new InternalServerErrorException('Failed to exchange code for Instagram management token');
    }
  }

  // LinkedIn Identity (minimal scopes)
  private async exchangeCodeForLinkedInIdentity(code: string, redirectUri?: string): Promise<OAuthTokens> {
    try {
      const clientId = this.configService.get<string>('LINKEDIN_CLIENT_ID');
      const clientSecret = this.configService.get<string>('LINKEDIN_CLIENT_SECRET');
      const defaultRedirectUri = this.configService.get<string>('LINKEDIN_REDIRECT_URI_V2') || 'https://uat.groreels.com/v2/identities/linkedin/callback';

      const response = await axios.post(
        'https://www.linkedin.com/oauth/v2/accessToken',
        null,
        {
          params: {
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: redirectUri || defaultRedirectUri,
            client_id: clientId,
            client_secret: clientSecret,
          },
        },
      );

      return {
        accessToken: response.data.access_token,
        scope: 'identity_only', // Minimal scope for sign-in
      };
    } catch (error) {
      console.error('Error exchanging code for LinkedIn identity token:', error);
      throw new InternalServerErrorException('Failed to exchange code for LinkedIn identity token');
    }
  }

  // LinkedIn Management (full scopes)
  private async exchangeCodeForLinkedInManagement(code: string, redirectUri?: string): Promise<OAuthTokens> {
    try {
      const clientId = this.configService.get<string>('LINKEDIN_CLIENT_ID');
      const clientSecret = this.configService.get<string>('LINKEDIN_CLIENT_SECRET');
      const defaultRedirectUri = this.configService.get<string>('LINKEDIN_REDIRECT_URI_V2') || 'https://uat.groreels.com/v2/identities/linkedin/callback';

      const response = await axios.post(
        'https://www.linkedin.com/oauth/v2/accessToken',
        null,
        {
          params: {
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: redirectUri || defaultRedirectUri,
            client_id: clientId,
            client_secret: clientSecret,
          },
        },
      );

      return {
        accessToken: response.data.access_token,
        scope: 'full_management', // Full scope for content management
      };
    } catch (error) {
      console.error('Error exchanging code for LinkedIn management token:', error);
      throw new InternalServerErrorException('Failed to exchange code for LinkedIn management token');
    }
  }

  // Profile fetching methods
  async getTikTokProfile(accessToken: string): Promise<OAuthProfile> {
    try {
      const response = await axios.get('https://open.tiktokapis.com/v2/user/info/', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        params: {
          fields: [
            'open_id',
            'union_id',
            'display_name',
            'avatar_url',
            'avatar_url_100',
            'avatar_large_url',
            'profile_deep_link',
          ].join(',')
        }
      });

      return {
        id: response.data.data.user.open_id,
        subjectId: response.data.data.user.open_id,
        username: response.data.data.user.union_id,
        displayName: response.data.data.user.display_name,
        avatar: response.data.data.user.avatar_url,
        profilePicture: response.data.data.user.avatar_url,
        platform: 'tiktok',
        platformData: {
          unionId: response.data.data.user.union_id,
          profileLink: response.data.data.user.profile_link
        }
      };
    } catch (error) {
      throw new InternalServerErrorException(`Failed to get TikTok profile: ${error.message}`);
    }
  }

  async getInstagramProfile(accessToken: string): Promise<OAuthProfile> {
    try {
      const response = await axios.get(`https://graph.instagram.com/me?fields=id,username,account_type&access_token=${accessToken}`);

      return {
        id: response.data.id,
        subjectId: response.data.id,
        username: response.data.username,
        platform: 'instagram',
        platformData: {
          accountType: response.data.account_type
        }
      };
    } catch (error) {
      throw new InternalServerErrorException(`Failed to get Instagram profile: ${error.message}`);
    }
  }

  async getYouTubeProfile(accessToken: string): Promise<OAuthProfile> {
    try {
      const response = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      return {
        id: response.data.id,
        subjectId: response.data.id,
        username: response.data.email,
        displayName: response.data.name,
        avatar: response.data.picture,
        profilePicture: response.data.picture,
        platform: 'youtube',
        platformData: {
          email: response.data.email,
          verified: response.data.verified_email
        }
      };
    } catch (error) {
      throw new InternalServerErrorException(`Failed to get YouTube profile: ${error.message}`);
    }
  }

  async getLinkedInProfile(accessToken: string): Promise<OAuthProfile> {
    try {
      const response = await axios.get('https://api.linkedin.com/v2/userinfo', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'X-Restli-Protocol-Version': '2.0.0'
        }
      });

      return {
        id: response.data.id,
        subjectId: response.data.id,
        displayName: `${response.data.localizedFirstName} ${response.data.localizedLastName}`,
        platform: 'linkedin',
        platformData: {
          firstName: response.data.localizedFirstName,
          lastName: response.data.localizedLastName
        }
      };
    } catch (error) {
      throw new InternalServerErrorException(`Failed to get LinkedIn profile: ${error.message}`);
    }
  }

  // Token refresh methods
  async refreshTikTokToken(refreshToken: string): Promise<OAuthTokens> {
    try {
      const clientKey = this.configService.get<string>('TIKTOK_CLIENT_KEY');
      const clientSecret = this.configService.get<string>('TIKTOK_CLIENT_SECRET');

      const response = await axios.post(
        'https://open.tiktokapis.com/v2/oauth/token/',
        new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_key: clientKey,
          client_secret: clientSecret,
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        },
      );

      return response.data;
    } catch (error) {
      console.error('Error refreshing TikTok token:', error);
      throw new InternalServerErrorException('Failed to refresh TikTok token');
    }
  }

  async refreshYouTubeToken(refreshToken: string): Promise<OAuthTokens> {
    try {
      this.oauth2Client.setCredentials({ refresh_token: refreshToken });
      const { credentials } = await this.oauth2Client.refreshAccessToken();

      return {
        accessToken: credentials.access_token,
        refreshToken: credentials.refresh_token || refreshToken,
        expiresIn: credentials.expiry_date ? Math.floor(credentials.expiry_date / 1000) : undefined,
      };
    } catch (error) {
      console.error('Error refreshing YouTube token:', error);
      throw new InternalServerErrorException('Failed to refresh YouTube token');
    }
  }

  // Generic token refresh method
  async refreshToken(platform: string, refreshToken: string): Promise<OAuthTokens> {
    switch (platform) {
      case 'tiktok':
        return this.refreshTikTokToken(refreshToken);
      case 'youtube':
        return this.refreshYouTubeToken(refreshToken);
      default:
        throw new BadRequestException(`Token refresh not supported for platform: ${platform}`);
    }
  }
}
