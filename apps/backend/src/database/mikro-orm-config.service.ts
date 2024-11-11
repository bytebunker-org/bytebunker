import { Injectable } from '@nestjs/common';
import type { MikroOrmModuleOptions, MikroOrmOptionsFactory } from '@mikro-orm/nestjs/typings.js';
import { PostgreSqlDriver } from '@mikro-orm/postgresql';
import { NotFoundError } from '../util/rest-error.js';
import { TsMorphMetadataProvider } from '@mikro-orm/reflection';
import { AppConfig, NodeEnvironment } from '../util/config/app.config.js';
import { MikroOrmConfig } from '../util/config/mikro-orm.config.js';

@Injectable()
export class MikroOrmConfigService implements MikroOrmOptionsFactory<PostgreSqlDriver> {
    constructor(
        private readonly appConfig: AppConfig,
        private readonly config: MikroOrmConfig,
    ) {}

    createMikroOrmOptions(): MikroOrmModuleOptions<PostgreSqlDriver> {
        return {
            driver: PostgreSqlDriver,
            dbName: this.config.database,
            host: this.config.host,
            port: this.config.port,
            user: this.config.user,
            password: this.config.password,
            entities: this.config.entities,
            entitiesTs: this.config.entitiesTs,
            metadataProvider:
                this.appConfig.nodeEnv === NodeEnvironment.DEVELOPMENT ? TsMorphMetadataProvider : undefined,
            ignoreUndefinedInQuery: true,
            findOneOrFailHandler: (entityName: string) => {
                return new NotFoundError(`${entityName} not found!`);
            },
        };
    }
}
