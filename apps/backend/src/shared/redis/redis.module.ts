import { Module } from '@nestjs/common';
import { REDIS_PROVIDER } from './redis.constant.js';
import { redisProvider } from './redis.provider.js';

@Module({
    providers: [redisProvider],
    exports: [REDIS_PROVIDER],
})
export class RedisModule {}
