import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

@Injectable()
export class ManagementAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const user = request['user'] as any; // JWT payload can have different properties

    // Check if user has management permissions
    // This will be enhanced when we implement the PolicyService in v3
    return !!user && (!!user.sub || !!user.id || !!user._id); // Basic check for now
  }
}
