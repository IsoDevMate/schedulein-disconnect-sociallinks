import { Injectable } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class InstagramTokenValidatorService {
  async validateToken(token: string, expectedUserId?: string): Promise<{
    isValid: boolean;
    tokenType: 'oauth' | 'jwt' | 'unknown';
    error?: string;
  }> {
    console.log('Validating token:', token);
    try {
      if (this.isJWTToken(token)) {
        console.log('Token detected as JWT');
        const jwtValidation = await this.validateJWTToken(token);
        console.log('JWT validation result:', jwtValidation);
        return {
          isValid: jwtValidation.isValid,
          tokenType: 'jwt',
          error: jwtValidation.error
        };
      }
      // OAuth token
      console.log('Token detected as OAuth');
      const oauthValidation = await this.validateOAuthToken(token, expectedUserId);
      console.log('OAuth validation result:', oauthValidation);
      return {
        isValid: oauthValidation.isValid,
        tokenType: 'oauth',
        error: oauthValidation.error
      };
    } catch (error) {
      console.error('Token validation threw error:', error);
      return {
        isValid: false,
        tokenType: 'unknown',
        error: error.message
      };
    }
  }

  private isJWTToken(token: string): boolean {
    return typeof token === 'string' && token.split('.').length === 3;
  }

  private async validateJWTToken(token: string): Promise<{ isValid: boolean; error?: string }> {
    try {
      const payload = this.decodeJWTPayload(token);
      if (!payload) return { isValid: false, error: 'Invalid JWT payload' };
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp && payload.exp < now) return { isValid: false, error: 'JWT token has expired' };
      return { isValid: true };
    } catch (error) {
      return { isValid: false, error: `JWT validation failed: ${error.message}` };
    }
  }

  private async validateOAuthToken(token: string, expectedUserId?: string): Promise<{ isValid: boolean; error?: string }> {
    try {
      // Use the correct Instagram Graph API endpoint for Instagram tokens
      const response = await axios.get(
        `https://graph.instagram.com/me?fields=id,username&access_token=${token}`
      );
      if (response.status === 200) {
        if (expectedUserId && response.data.id !== expectedUserId) {
          return { isValid: false, error: 'Token does not match expected Instagram user ID.' };
        }
        return { isValid: true };
      }
      return { isValid: false, error: 'OAuth token validation failed' };
    } catch (error) {
      const errorData = error.response?.data?.error;
      return {
        isValid: false,
        error: errorData?.message || 'OAuth token validation failed'
      };
    }
  }

  private decodeJWTPayload(token: string): any {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) throw new Error('Invalid JWT format');
      const payload = parts[1];
      const decoded = Buffer.from(payload, 'base64').toString('utf-8');
      return JSON.parse(decoded);
    } catch (error) {
      throw new Error('Failed to decode JWT payload');
    }
  }
}
