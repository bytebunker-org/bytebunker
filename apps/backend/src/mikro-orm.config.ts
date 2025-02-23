import { selectConfig, TypedConfigModule } from 'nest-typed-config';
import { IsObject, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { buildTypedConfigModuleOptions } from './util/config/config.util.js';
import { defineConfig, GeneratedCacheAdapter } from '@mikro-orm/postgresql';
import { TsMorphMetadataProvider } from '@mikro-orm/reflection';
import { NotFoundError } from './util/rest-error.js';
import { MikroOrmConfig } from './util/config/mikro-orm.config.js';
import { UnderscoreNamingStrategy } from '@mikro-orm/core';
import metadataCache from './util/generated/mikro-orm-cache/metadata.json' with { type: 'json' };

// TODO We use toml.
if (!process.env['NODE_ENV']) {
    process.env['NODE_ENV'] = 'development';
}

const basename = process.env['MIKRO_ORM_MIGRATION'] ? '.env.migration' : undefined;

class AppConfig {
    @Type(() => MikroOrmConfig)
    @IsObject()
    @ValidateNested()
    public readonly mikroOrm!: MikroOrmConfig;
}

const isProduction = process.env['NODE_ENV'] !== 'development';
const isBuildingMetadata = process.env['BUILD_MIKRO_ORM_METADATA'] === '1';

function buildMikroOrmConfig() {
    const ConfigModule = TypedConfigModule.forRoot(buildTypedConfigModuleOptions(AppConfig, basename));

    const config = selectConfig(ConfigModule, MikroOrmConfig);

    return defineConfig({
        dbName: config.database,
        host: config.host,
        port: config.port,
        user: config.user,
        password: config.password,
        entities: config.entities,
        entitiesTs: config.entitiesTs,
        debug: config.logging ?? false,
        metadataProvider: TsMorphMetadataProvider,
        metadataCache: {
            ...(isProduction
                ? {
                      enabled: true,
                      adapter: GeneratedCacheAdapter,
                      options: { data: metadataCache },
                  }
                : {
                      options: {
                          cacheDir: './src/util/generated/mikro-orm-cache',
                      },
                  }),
        },
        namingStrategy: UnderscoreNamingStrategy,
        ignoreUndefinedInQuery: true,
        findOneOrFailHandler: (entityName: string) => new NotFoundError(`${entityName} not found!`),
    });
}

function buildMetadataBuildingConfig() {
    return defineConfig({
        dbName: 'bytebunker',
        entities: ['./src/**/*.entity.ts'],
        entitiesTs: ['./src/**/*.entity.ts'],
        metadataProvider: TsMorphMetadataProvider,
        metadataCache: {
            options: {
                cacheDir: './src/util/generated/mikro-orm-cache',
            },
        },
    });
}

export default isBuildingMetadata ? buildMetadataBuildingConfig() : buildMikroOrmConfig();
