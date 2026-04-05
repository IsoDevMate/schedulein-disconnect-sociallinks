import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { AuthService } from "../auth.service";
import { jwtConstants } from "../constants";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private authService: AuthService) {
    super({
      jwtFromRequest: (req) => {
        // Custom token extraction with debugging
        const authHeader = req.headers.authorization;
        console.log(
          "Raw Authorization header received:",
          authHeader ? `${authHeader.substring(0, 30)}...` : "MISSING",
        );

        if (!authHeader) {
          console.log("No Authorization header found");
          return null;
        }

        if (!authHeader.startsWith("Bearer ")) {
          console.log('Authorization header does not start with "Bearer "');
          return null;
        }

        // Extract the token part after 'Bearer '
        const tokenString = authHeader.substring(7);

        // Handle case where both access and refresh tokens are sent (separated by &)
        const token = tokenString.split("&")[0]; // Take only the first part (access token)

        // Check if token has the correct JWT format (3 parts separated by dots)
        const tokenParts = token.split(".");
        /*         console.log('Token parts count:', tokenParts.length); */

        if (tokenParts.length !== 3) {
          /*      console.log('Invalid JWT format - should have 3 parts separated by dots'); */
          return null;
        }

        return token;
      },
      ignoreExpiration: false,
      secretOrKey: jwtConstants.secret,
    });
  }

  async validate(payload: any) {
    try {
      // Check if token is expired
      if (payload.exp && Date.now() >= payload.exp * 1000) {
        console.error("JWT Error: Token has expired");
        throw new UnauthorizedException("Token has expired");
      }

      // Check if token has all required fields
      if (!payload.sub || !payload.email) {
        console.error("JWT Error: Missing required fields in token");
        throw new UnauthorizedException(
          "Invalid token: missing required fields",
        );
      }

      const accessToken =
        payload.access_token ||
        (payload.socialAccounts && payload.socialAccounts[0]?.accessToken);

      if (accessToken) {
        try {
          const isBlacklisted =
            await this.authService.isTokenBlacklisted(accessToken);
          console.log("Token blacklist status:", isBlacklisted);

          if (isBlacklisted) {
            throw new UnauthorizedException("Token has been revoked");
          }
        } catch (error) {
          console.error("Error checking token blacklist:", error);
          throw error;
        }
      } else {
        console.log(
          "No access token found in payload, skipping blacklist check",
        );
      }

      // Prepare user object
      const user = {
        userId: payload.sub,
        email: payload.email,
        role: payload.role,
        authMethod: payload.authMethod,
        ...payload,
      };

      // console.log('JWT validation successful, returning user:', {
      //   userId: user.userId,
      //   email: user.email,
      //   role: user.role,
      //   authMethod: user.authMethod,
      //   hasSocialAccounts: !!user.socialAccounts?.length
      // });

      return user;
    } catch (error) {
      console.error("Error in JWT validation:", error);
      throw error;
    }
  }
}
