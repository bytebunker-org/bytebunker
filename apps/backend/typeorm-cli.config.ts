import { DataSource } from 'typeorm';
import { fileLoader, selectConfig, TypedConfigModule } from 'nest-typed-config';
import { IsObject, ValidateNested } from 'class-validator';
import { MikroOrmConfig } from './src/util/config/mikro-orm.config.js';
import { EntitySuffixDatabaseNamingStrategy } from './src/database/util/entity-suffix-database-naming-strategy.util.js';
import pg from 'pg';
import { Type } from 'class-transformer';

if (!process.env['NODE_ENV']) {
    process.env['NODE_ENV'] = 'development';
}

const basename = process.env['TYPEORM_MIGRATION'] ? '.env.migration' : undefined;

class AppConfig {
    @IsObject()
    @Type(() => MikroOrmConfig)
    @ValidateNested()
    public readonly typeOrm!: MikroOrmConfig;
}

export const ConfigModule = TypedConfigModule.forRoot({
    isGlobal: true,
    schema: AppConfig,
    load: fileLoader({
        basename,
        ignoreEnvironmentVariableSubstitution: false,
    }),
});

export const config = selectConfig(ConfigModule, MikroOrmConfig);

export default new DataSource({
    type: 'postgres',
    host: config.host,
    port: config.port,
    username: config.username,
    password: config.password,
    database: config.database,
    logging: 'all',
    synchronize: false,
    entities: ['src/**/*.entity.ts'],
    migrations: ['tools/migration/*.ts'],
    namingStrategy: new EntitySuffixDatabaseNamingStrategy(),
    useUTC: true,
    driver: pg,
    nativeDriver: pg.native,
    extra: {
        parseInputDatesAsUTC: true,
    },
});
