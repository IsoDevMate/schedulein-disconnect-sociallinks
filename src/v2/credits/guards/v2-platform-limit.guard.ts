import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { V2CreditsService } from '../services/v2-credits.service';

@Injectable()
export class V2PlatformLimitGuard implements CanActivate {
  constructor(
    private readonly v2CreditsService: V2CreditsService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user; // V2JwtAuthGuard provides enhanced user object

    if (!user || !user.id) {
      throw new ForbiddenException('User not authenticated');
    }

    // Get platform from route metadata
    const platform = this.reflector.get<string>('platform', context.getHandler());

    if (!platform) {
      throw new ForbiddenException('Platform not specified for limit check');
    }

    // For now, we'll assume 0 current connections since we don't have access to identities service here
    // In a real implementation, you'd inject the identities service to get current connections
    const currentConnections = 0; // This should be fetched from identities service

    const hasLimit = await this.v2CreditsService.checkPlatformLimit(user.id, platform, currentConnections);

    if (!hasLimit) {
      throw new ForbiddenException(`Platform limit reached for ${platform}. Please upgrade your plan to connect more accounts.`);
    }

    return true;
  }
}

