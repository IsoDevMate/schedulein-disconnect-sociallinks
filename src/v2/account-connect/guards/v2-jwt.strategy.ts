import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class V2JwtStrategy extends PassportStrategy(Strategy, 'v2-jwt') {
  constructor(private configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET'),
    });
  }

  async validate(payload: any) {
    console.log('V2JwtStrategy: Validating payload:', {
      sub: payload.sub,
      email: payload.email,
      authMethod: payload.authMethod,
      hasIdentities: !!payload.identities?.length
    });

    return {
      sub: payload.sub,
      email: payload.email,
      role: payload.role,
      authMethod: payload.authMethod,
      identities: payload.identities || [],
      name: payload.name,
      avatar: payload.avatar,
      // Legacy support
      userId: payload.sub,
      id: payload.sub,
    };
  }
}
