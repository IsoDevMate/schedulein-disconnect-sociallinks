import { Module } from '@nestjs/common';
import { LinkedInService } from './linkedin.service';
import { LinkedInController } from './linkedin.controller';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { UsersModule } from 'src/users/users.module';
import { ArticleshareService } from 'src/articleshare/articleshare.service';
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    HttpModule.register({
      timeout: 5000,
      maxRedirects: 10,
    }),
    UsersModule,
  ],
  controllers: [LinkedInController],
  providers: [LinkedInService, ArticleshareService],
  exports: [LinkedInService],
})
export class LinkedinModule {}
