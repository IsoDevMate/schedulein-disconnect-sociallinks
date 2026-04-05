import { Module, forwardRef } from '@nestjs/common';
import { S3Service } from './s3.service';
import { ConfigModule } from '@nestjs/config';
import { UsersModule } from '../users/users.module';
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    forwardRef(() => UsersModule),
  ],
  providers: [S3Service],
  exports: [S3Service],
})
export class S3Module {}
