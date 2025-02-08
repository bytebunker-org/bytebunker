import type { FactoryProvider } from '@nestjs/common';
import neo4j from 'neo4j-driver';
import { Neo4jConfig } from '../util/config/neo4j.config.js';
import { NEO4J_DRIVER_PROVIDER, NEO4J_LOGGER_PROVIDER } from './graph-database.constant.js';
import type { LoggerFunction } from 'neo4j-driver-core/types/types.d.ts';

export const neo4jDriverProvider: FactoryProvider = {
    provide: NEO4J_DRIVER_PROVIDER,
    useFactory: (config: Neo4jConfig, logger: LoggerFunction) => {
        return neo4j.driver(config.url, neo4j.auth.basic(config.user, config.password), {
            disableLosslessIntegers: true,
            logging: {
                level: config.logLevel,
                logger: logger,
            },
        });
    },
    inject: [Neo4jConfig, NEO4J_LOGGER_PROVIDER],
};
