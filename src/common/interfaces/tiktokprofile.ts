export interface TikTokProfile {
  display_name: string;
  avatar_url: string;
  open_id: string;
  union_id: string;
  profile_deep_link: string;
}

export interface TikTokData {
  openId: string;
  unionId: string;
  profileLink: string;
  avatarUrl?: string;
  displayName?: string;
}
