import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OAuthService } from './oauth.service';

@Module({
  imports: [ConfigModule],
  providers: [OAuthService],
  exports: [OAuthService],
})
export class OAuthModule {}
