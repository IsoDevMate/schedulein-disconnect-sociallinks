
import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { Strategy } from "passport-tiktok-auth";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class TikTokAuthStrategy extends PassportStrategy(Strategy, "tiktok") {
  constructor(private readonly configService: ConfigService) {
    super({
      clientID: configService.get<string>("TIKTOK_CLIENT_KEY"),
      clientSecret: configService.get<string>("TIKTOK_CLIENT_SECRET"),
      callbackURL:
        configService.get<string>("TIKTOK_REDIRECT_URI") ||
        "https://uat.groreels.com/auth/tiktok/callback",
      scope: ["user.info.basic", "user.info.avatar"],
      passReqToCallback: true,
      authorizationURL: "https://www.tiktok.com/v2/auth/authorize/",
      tokenURL: "https://open.tiktokapis.com/v2/oauth/token/",
      profileURL: "https://open.tiktokapis.com/v2/user/info/",
    });
  }

  async validate(
    req: any,
    accessToken: string,
    refreshToken: string,
    profile: any,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
    done: Function,
  ) {
    try {
      console.log("TikTok Profile Data:", profile);

      // TikTok v2 API returns data in a different structure
      const userData = {
        tiktokId: profile.open_id || profile.id,
        displayName: profile.display_name || profile.username,
        email: `tiktok_${profile.open_id || profile.id}@placeholder.com`,
        accessToken,
        refreshToken,
        avatar: profile.avatar_url,
      };

      console.log("Processed User Data:", userData);
      return done(null, userData);
    } catch (error) {
      console.error("TikTok Strategy Validation Error:", error);
      return done(error, null);
    }
  }
}
