import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AsynchedProducerService } from './asynched-producer.service';
import { AsynchedConsumerService } from './asynched-consumer.service';
import { AsynchedController } from './asynched.controller';
import { FFmpegService } from '../ugc/services/ffmpeg.service';
import { S3Service } from '../s3/s3.service';
import { UsersModule } from '../users/users.module';
import { S3Module } from 'src/s3/s3.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    BullModule.forRootAsync({
      useFactory: async (configService: ConfigService) => ({
        connection: {
          url: configService.get<string>('REDIS_URL'),
        },
      }),
      inject: [ConfigService],
    }),
    BullModule.registerQueue({
      name: 'asynched-jobs',
    }),
    S3Module,
    UsersModule
  ],
  providers: [AsynchedProducerService, AsynchedConsumerService, FFmpegService],
  controllers: [AsynchedController],
  exports: [AsynchedProducerService],
})
export class AsynchedModule {}
