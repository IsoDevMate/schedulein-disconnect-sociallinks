import { Module, forwardRef } from '@nestjs/common';
import { InstagramController } from './instagram.controller';
import { InstagramService } from './instagram.service';
import { UsersModule } from '../users/users.module';
import { S3Service } from '../s3/s3.service';
import { S3Module } from '../s3/s3.module';
import { InstagramTokenValidatorService } from './instagram-token-validator.service';

@Module({
  imports: [forwardRef(() => UsersModule), S3Module],
  controllers: [InstagramController],
  providers: [InstagramService, InstagramTokenValidatorService, S3Service],
  exports: [InstagramTokenValidatorService],
})
export class InstagramModule {}
