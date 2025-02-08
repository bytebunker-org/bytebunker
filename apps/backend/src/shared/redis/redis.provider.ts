import type { RedisOptions } from 'ioredis';
import RedisClass from 'ioredis';
import { REDIS_PROVIDER } from './redis.constant.js';
import type { FactoryProvider } from '@nestjs/common';
import type { Constructable } from '../../util/type/constructable.interface.js';
import { RedisConfig } from './redis.config.js';

const Redis = RedisClass as unknown as Constructable;

export const redisProvider: FactoryProvider = {
    provide: REDIS_PROVIDER,
    useFactory: (config: RedisConfig) => {
        const options: RedisOptions = {
            host: config.host,
            port: config.port,
            username: config.username,
            password: config.password,
            maxRetriesPerRequest: null,
        };

        return new Redis(options);
    },
    inject: [RedisConfig],
};
