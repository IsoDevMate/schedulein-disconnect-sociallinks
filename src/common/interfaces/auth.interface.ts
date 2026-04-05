export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expires_in: string;
  user?: any;
  deviceInfo?: string;
  IpAddress?: string;
}

export interface TikTokTokenResponse {
  open_id: string;
  scope: string;
  access_token: string;
  expires_in: number;
  refresh_token: string;
  refresh_expires_in: number;
  token_type: string;
}
