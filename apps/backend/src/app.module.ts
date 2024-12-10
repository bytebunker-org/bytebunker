import { Module } from '@nestjs/common';
import { ConfigModule } from './util/config/config.module.js';
import { DatabaseModule } from './database/database.module.js';
import { MikroOrmConfigService } from './database/mikro-orm-config.service.js';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { RedisModule } from './shared/redis/redis.module.js';
import { CacheModule } from '@nestjs/cache-manager';
import { HealthModule } from './shared/health/health.module.js';

@Module({
    imports: [
        ConfigModule,
        RedisModule,
        MikroOrmModule.forRootAsync({
            imports: [DatabaseModule],
            useExisting: MikroOrmConfigService,
        }),
        CacheModule.register({
            isGlobal: true,
        }),
        HealthModule,
    ],
})
export class AppModule {}
