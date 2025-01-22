import { Module } from '@nestjs/common';
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
import { PipelineBlueprintModule } from './etl/pipeline/blueprint/pipeline-blueprint.module.js';

@Module({
    imports: [
        ConfigModule,
        MikroOrmModule.forRootAsync({
            imports: [DatabaseModule],
            useExisting: MikroOrmConfigService,
        }),
        CacheModule.register({
            isGlobal: true,
        }),
        FindRestApiModule,
        HealthModule,
        AuthModule,
        JsonSchemaValidationModule,
        JsonSchemaModule,
        SettingModule,
        ExtensionModule,
        PipelineModule,
        UserModule,
    ],
})
export class AppModule {}
