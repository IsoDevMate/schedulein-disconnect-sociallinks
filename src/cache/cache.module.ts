import { Global, Module, Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';
import { redisStore } from 'cache-manager-redis-store';
import { RedisClientOptions } from 'redis';
import * as url from 'url';

export const CACHE_TTL = 3600;

export const CACHE_KEYS = {
  VIDEO_ANALYTICS: (videoId: string) => `video:${videoId}`,
  TRENDING_VIDEOS: (region: string = 'US') => `trending:${region}`,
  NICHE_ANALYTICS: (niche: string) => `niche:${niche}`,
  POSTING_TIMES: (niche?: string) =>
    niche ? `posting:${niche}` : 'posting:global',
};

function parseRedisUrl(redisUrl: string) {
  try {
    const parsed = new url.URL(redisUrl);
    return {
      host: parsed.hostname,
      port: parseInt(parsed.port, 10),
      username: parsed.username || undefined,
      password: parsed.password || undefined,
      tls: parsed.protocol === 'rediss:' ? {} : undefined,
    };
  } catch (error) {
    throw new Error(`Invalid Redis URL: ${error.message}`);
  }
}

@Global()
@Module({
  imports: [
    NestCacheModule.registerAsync<RedisClientOptions>({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => {
        const logger = new Logger('CacheModule');
        const redisUrl = configService.get('REDIS_URL');

        if (!redisUrl) {
          logger.warn('REDIS_URL not found in environment variables. Using in-memory cache.');
          return { ttl: CACHE_TTL * 1000 };
        }

        try {
          const { host, port, username, password, tls } = parseRedisUrl(redisUrl);

          logger.log(`Connecting to Redis at ${host}:${port}`);

          return {
            store: await redisStore({
              socket: {
                host,
                port,
                tls,
              },
              username,
              password,
              ttl: CACHE_TTL * 1000, // Convert to milliseconds
            }),
          };
        } catch (error) {
          logger.error('Failed to connect to Redis', error.stack);
          logger.warn('Falling back to in-memory cache');
          return { ttl: CACHE_TTL * 1000 };
        }
      },
      isGlobal: true,
    }),
  ],
  exports: [NestCacheModule],
})
export class CacheModule {}
