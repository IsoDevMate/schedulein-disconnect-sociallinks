import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import {
  Strategy as LinkedInOAuth2Strategy,
  Profile as LinkedInProfile,
} from "passport-linkedin-oauth2";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class LinkedInStrategy extends PassportStrategy(
  LinkedInOAuth2Strategy,
  "linkedin",
) {
  constructor(private readonly configService: ConfigService) {
    const clientID = configService.get<string>("LINKEDIN_CLIENT_ID");
    const clientSecret = configService.get<string>("LINKEDIN_CLIENT_SECRET");
    super({
      clientID,
      clientSecret,
      callbackURL: "http://localhost:3000/auth/linkedin/callback",
      scope: [
        "openid",
        "profile",
        "email",
        "r_liteprofile",
        "r_emailaddress",
        "w_member_social",
        "rw_organization_admin",
        "w_organization_social",
        "w_organization_content",
        "r_organization_social",
        "r_organization_content",
        "r_compliance",
      ],
      passReqToCallback: true,
      authorizationURL: "https://www.linkedin.com/oauth/v2/authorization",
      tokenURL: "https://www.linkedin.com/oauth/v2/accessToken",
    });
  }

  async validate(
    req: Request,
    accessToken: string,
    refreshToken: string,
    profile: LinkedInProfile,
    done: (error: any, user?: any) => void,
  ): Promise<any> {
    try {
      const { id, name, emails, photos } = profile;
      const user = {
        linkedInId: id,
        firstName: name?.givenName || "",
        lastName: name?.familyName || "",
        email: emails?.[0]?.value || "",
        pictureUrl: photos?.[0]?.value || "",
        accessToken,
        refreshToken,
      };
      done(null, user);
    } catch (error) {
      done(error, false);
    }
  }
}
