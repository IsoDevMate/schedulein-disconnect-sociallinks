
export interface TikTokApiError {
  code: string;
  message: string;
  log_id: string;
}

export interface TikTokCreatorInfoData {
  creator_avatar_url: string;
  creator_username: string;
  creator_nickname: string;
  privacy_level_options: string[];
  comment_disabled: boolean;
  duet_disabled: boolean;
  stitch_disabled: boolean;
  max_video_post_duration_sec: number;
}

export interface TikTokCreatorInfoResponse {
  data: TikTokCreatorInfoData;
  error: TikTokApiError;
}

export interface TikTokPostInitData {
  publish_id: string;
  upload_url?: string; // Only for FILE_UPLOAD
}

export interface TikTokPostInitResponse {
  data: TikTokPostInitData;
  error: TikTokApiError;
}

export interface TikTokPostInfo {
  title?: string;
  privacy_level:
    | "PUBLIC_TO_EVERYONE"
    | "MUTUAL_FOLLOW_FRIENDS"
    | "FOLLOWER_OF_CREATOR"
    | "SELF_ONLY";
  disable_duet?: boolean;
  disable_comment?: boolean;
  disable_stitch?: boolean;
  video_cover_timestamp_ms?: number;
  brand_content_toggle?: boolean;
  brand_organic_toggle?: boolean;
  is_aigc?: boolean;
}

export interface TikTokSourceInfo {
  source: "FILE_UPLOAD" | "PULL_FROM_URL";
  video_url?: string; // Required for PULL_FROM_URL
  video_size?: number; // Required for FILE_UPLOAD
  chunk_size?: number; // Required for FILE_UPLOAD
  total_chunk_count?: number; // Required for FILE_UPLOAD
}

export interface CreatorInfoFormatted {
  success: boolean;
  data: TikTokCreatorInfoData;
  creator_info: {
    avatar_url: string;
    username: string;
    nickname: string;
    privacy_level_options: string[];
    settings: {
      comment_disabled: boolean;
      duet_disabled: boolean;
      stitch_disabled: boolean;
    };
    max_video_duration_sec: number;
  };
  raw_response: TikTokCreatorInfoResponse;
}


