import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { ConfigModule } from './util/config/config.module.js';
import { DatabaseModule } from './database/database.module.js';
import { MikroOrmConfigService } from './database/mikro-orm-config.service.js';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { CacheModule } from '@nestjs/cache-manager';
import { HealthModule } from './shared/health/health.module.js';
import { SettingModule } from './shared/setting/setting.module.js';
import { ExtensionModule } from './extension/extension.module.js';
import { AuthModule } from './auth/auth.module.js';
import { PipelineModule } from './etl/pipeline/pipeline.module.js';
import { FindRestApiModule } from './shared/find-rest-api/find-rest-api.module.js';
import { JsonSchemaValidationModule } from './shared/json-schema-validation/json-schema-validation.module.js';
import { JsonSchemaModule } from './shared/json-schema/json-schema.module.js';
import { UserModule } from './user/user.module.js';
import { APP_GUARD } from '@nestjs/core';
import { LocalUserGuard } from './auth/local-user.guard.js';
import session from 'express-session';
import passport from 'passport';
import { AppConfig } from './util/config/app.config.js';
import { MikroOrmSessionStoreService } from './auth/mikro-orm-session-store.service.js';
import { DatatableModule } from './shared/datatable/datatable.module.js';
import { AssetModule } from './etl/asset/asset.module.js';
import { BullModule } from '@nestjs/bullmq';
import type { QueueOptions } from 'bullmq';
import { REDIS_PROVIDER } from './shared/redis/redis.constant.js';
import type { Redis } from 'ioredis';
import { RedisModule } from './shared/redis/redis.module.js';
import { BullBoardModule } from '@bull-board/nestjs';
import { QueueModule } from './queue/queue.module.js';

@Module({
    imports: [
        ConfigModule,
        MikroOrmModule.forRootAsync({
            imports: [DatabaseModule],
            useExisting: MikroOrmConfigService,
        }),
        RedisModule,
        QueueModule,
        CacheModule.register({
            isGlobal: true,
        }),
        AssetModule,
        FindRestApiModule,
        DatatableModule,
        HealthModule,
        AuthModule,
        JsonSchemaValidationModule,
        JsonSchemaModule,
        SettingModule,
        ExtensionModule,
        PipelineModule,
        UserModule,
    ],
    providers: [
        {
            provide: APP_GUARD,
            useClass: LocalUserGuard,
        },
    ],
})
export class AppModule implements NestModule {
    constructor(
        private readonly config: AppConfig,
        private readonly mikroOrmSessionStoreService: MikroOrmSessionStoreService,
    ) {}

    configure(consumer: MiddlewareConsumer): void {
        consumer
            .apply(
                session({
                    secret: this.config.session.secret,
                    name: 'sid',
                    resave: false,
                    saveUninitialized: false,
                    proxy: true,
                    store: this.mikroOrmSessionStoreService,
                    cookie: {
                        domain: this.config.session.cookieDomain,
                        maxAge: this.config.session.cookieMaxAge,
                        httpOnly: true,
                        sameSite: this.config.session.cookieSameSite,
                        secure: this.config.nodeEnv !== 'development',
                    },
                }),
                passport.initialize(),
                passport.session(),
            )
            .forRoutes('*');
    }
}
