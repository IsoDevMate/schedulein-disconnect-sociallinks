import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from "@nestjs/common";
import { AuthService } from "../../../auth/auth.service";
import { ModuleRef } from "@nestjs/core";
import { AuthGuard } from "@nestjs/passport";
import { Observable } from "rxjs";
import { tap } from "rxjs/operators";

@Injectable()
export class V2JwtAuthGuard extends AuthGuard("v2-jwt") {
  private authService: AuthService;

  constructor(private moduleRef: ModuleRef) {
    super();
    this.authService = this.moduleRef.get(AuthService, { strict: false });
  }

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest();
    console.log("V2JwtAuthGuard: Starting canActivate for route:", request.path);

    const canActivateResult = super.canActivate(context);

    if (typeof canActivateResult === "boolean") {
      console.log("V2JwtAuthGuard: canActivate sync result:", canActivateResult);
      return canActivateResult;
    } else if (canActivateResult instanceof Promise) {
      console.log("V2JwtAuthGuard: Handling Promise result...");
      return canActivateResult
        .then((result) => {
          console.log(
            "V2JwtAuthGuard: canActivate Promise resolved with:",
            result,
          );
          return result;
        })
        .catch((error) => {
          console.error("V2JwtAuthGuard: Error in canActivate Promise:", error);
          throw error;
        });
    } else if (canActivateResult instanceof Observable) {
      console.log("V2JwtAuthGuard: Handling Observable result...");
      return canActivateResult.pipe(
        tap({
          next: (result) =>
            console.log("V2JwtAuthGuard: canActivate Observable next:", result),
          error: (error) =>
            console.error(
              "V2JwtAuthGuard: Error in canActivate Observable:",
              error,
            ),
        }),
      );
    }

    console.log(
      "V2JwtAuthGuard: Unknown canActivate result type:",
      typeof canActivateResult,
    );
    return canActivateResult;
  }

  handleRequest(err, user, info, context?: ExecutionContext) {
    console.log("V2JwtAuthGuard: handleRequest called with:", {
      error: err ? err.message : "No error",
      user: user
        ? {
            id: user.sub || user.userId,
            email: user.email,
            hasSocialAccounts: !!user.identities?.length,
            identities: user.identities,
          }
        : "No user",
      info: info || "No info",
      context: context ? "Context available" : "No context",
    });

    if (err || !user) {
      console.error("V2JwtAuthGuard: Authentication failed -", {
        error: err?.message || "No user object",
        info: info?.message || "No additional info",
      });
      throw err || new UnauthorizedException("Authentication failed");
    }

    let req, res;
    if (context) {
      req = context.switchToHttp().getRequest();
      res = context.switchToHttp().getResponse();

      // Enhanced user object for V2 endpoints
      req.user = {
        id: user.sub || user.id || user.userId,
        _id: user.sub || user.id || user.userId,
        email: user.email,
        name: user.name,
        role: user.role,
        authMethod: user.authMethod,
        identities: user.identities || [],
        // Extract TikTok identity if available
        tiktokIdentity: user.identities?.find(id => id.platform === 'tiktok'),
        // Extract other platform identities
        youtubeIdentity: user.identities?.find(id => id.platform === 'youtube'),
        instagramIdentity: user.identities?.find(id => id.platform === 'instagram'),
        linkedinIdentity: user.identities?.find(id => id.platform === 'linkedin'),
        // Legacy support
        ...(user.tiktokId && { tiktokId: user.tiktokId }),
        ...(user.tiktokAccessToken && { tiktokAccessToken: user.tiktokAccessToken }),
        ...(user.linkedInAccessToken && { linkedInAccessToken: user.linkedInAccessToken }),
        ...(user.tiktokData && { tiktokData: user.tiktokData }),
        ...(user.name && { name: user.name }),
        ...(user.avatar && { avatar: user.avatar }),
        ...user,
      };

      // Set res.locals.user for downstream use
      if (res && res.locals) {
        res.locals.user = req.user;
      }
      return req.user;
    }
    console.log("V2JwtAuthGuard: No context provided, returning user", user);
    return user;
  }
}
