import { selectConfig, TypedConfigModule } from 'nest-typed-config';
import { IsObject, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { buildTypedConfigModuleOptions } from './util/config/config.util.js';
import { defineConfig } from '@mikro-orm/postgresql';
import { TsMorphMetadataProvider } from '@mikro-orm/reflection';
import { NotFoundError } from './util/rest-error.js';
import { MikroOrmConfig } from './util/config/mikro-orm.config.js';

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

export const ConfigModule = TypedConfigModule.forRoot(buildTypedConfigModuleOptions(AppConfig, basename));

export const config = selectConfig(ConfigModule, MikroOrmConfig);

export default defineConfig({
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
        options: {
            cacheDir: './temp/mikro-orm-cache',
        },
    },
    ignoreUndefinedInQuery: true,
    findOneOrFailHandler: (entityName: string) => new NotFoundError(`${entityName} not found!`),
});
