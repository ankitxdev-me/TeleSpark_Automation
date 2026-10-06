import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TenantService } from '../tenant/tenant.service';
import { AuthService } from './auth.service';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly tenantService: TenantService,
    private readonly authService: AuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();

    // 1. Try Bearer JWT authentication (Used by web users & admin dashboard)
    const bearerToken = this.extractBearerToken(request);
    if (bearerToken) {
      const payload = this.authService.verifyToken(bearerToken);
      // Validate live user record from DB for suspension and immediate role elevation
      const dbUser = await this.authService.validateActiveUser(payload.sub);
      request.user = dbUser;
      request.tenantId = dbUser.tenantId;
      request.tenant = { id: dbUser.tenantId };
      return true;
    }

    // 2. Try x-api-key authentication (Machine-to-machine / programmatic API access)
    const apiKey = this.extractApiKey(request);
    if (apiKey) {
      const tenant = await this.tenantService.findByApiKey(apiKey);
      if (!tenant || !tenant.isActive) {
        throw new UnauthorizedException('Invalid or inactive API key');
      }

      request.tenant = tenant;
      request.tenantId = tenant.id;
      // Synthesize system admin user for API key requests
      request.user = {
        id: 'system-api-key',
        email: 'system@telespark.io',
        role: 'ADMIN',
        tenantId: tenant.id,
        name: 'Master API Key',
      };
      return true;
    }

    throw new UnauthorizedException(
      'Authentication required: Provide a valid Bearer token or x-api-key header',
    );
  }

  private extractBearerToken(request: any): string | null {
    const authHeader = request.headers['authorization'];
    if (authHeader && typeof authHeader === 'string') {
      if (authHeader.startsWith('Bearer ')) {
        const token = authHeader.slice(7).trim();
        // If it starts with 'ey' it's almost certainly a JWT
        if (token.startsWith('ey') || token.split('.').length === 3) {
          return token;
        }
      }
    }
    return null;
  }

  private extractApiKey(request: any): string | null {
    const headerKey = request.headers['x-api-key'];
    if (headerKey && typeof headerKey === 'string') {
      return headerKey.trim();
    }

    const authHeader = request.headers['authorization'];
    if (authHeader && typeof authHeader === 'string') {
      if (authHeader.startsWith('Bearer ')) {
        const key = authHeader.slice(7).trim();
        if (!key.startsWith('ey') && key.split('.').length !== 3) {
          return key;
        }
      } else {
        return authHeader.trim();
      }
    }

    return null;
  }
}
