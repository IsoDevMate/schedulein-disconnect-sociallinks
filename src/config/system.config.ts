import { registerAs } from '@nestjs/config';
import { Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';

export const systemConfig = registerAs('system', () => {
  const configService = new ConfigService();

  const userId = configService.get<string>('SYSTEM_YOUTUBE_USER_ID')

  if (!Types.ObjectId.isValid(userId)) {
    throw new Error(`Invalid SYSTEM_YOUTUBE_USER_ID format: ${userId}. Must be a valid MongoDB ObjectId`);
  }

  return {
    youtubeUserId: new Types.ObjectId(userId),
    youtubeUserIdString: userId,
  };
});
