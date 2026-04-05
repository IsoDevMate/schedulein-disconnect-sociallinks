import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { UGCController } from './ugc.controller';
import { UGCService } from './ugc.service';
import { Script, ScriptSchema } from './schemas/script.schema';
import { Avatar, AvatarSchema } from './schemas/avatar.schema';
import { Voice, VoiceSchema } from './schemas/voice.schema';
import { Video, VideoSchema } from './schemas/video.schema';
import { Image, ImageSchema } from './schemas/image.schema';
import { ElevenLabsService } from './services/eleven-labs.service';
import { MagicHourService } from './services/magic-hour.service';
import { S3Service } from '../s3/s3.service';
import { FFmpegService } from './services/ffmpeg.service';
import { OpenAIService } from '../openai/openai.service';
import { HttpModule } from '@nestjs/axios';
import { S3Module } from '../s3/s3.module';
import { OpenAIModule } from '../openai/openai.module';
import { UsersModule } from '../users/users.module';
import { AsynchedModule } from '../asynched/asynched.module';

@Module({
  imports: [
    ConfigModule,
    HttpModule,
    MongooseModule.forFeature([
      { name: Script.name, schema: ScriptSchema },
      { name: Avatar.name, schema: AvatarSchema },
      { name: Voice.name, schema: VoiceSchema },
      { name: Video.name, schema: VideoSchema },
      { name: Image.name, schema: ImageSchema },
    ]),
    S3Module,
    OpenAIModule,
    UsersModule,
    AsynchedModule,
  ],
  controllers: [UGCController],
  providers: [
    UGCService,
    ElevenLabsService,
    MagicHourService,
    FFmpegService,
    OpenAIService,
    S3Service,
  ],
  exports: [UGCService, MongooseModule, MagicHourService],
})
export class UGCModule {}
