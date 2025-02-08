import { type FactoryProvider, Logger } from '@nestjs/common';
import type { LoggerFunction } from 'neo4j-driver-core/types/types.d.ts';
import { NEO4J_LOGGER_PROVIDER } from './graph-database.constant.js';

export const neo4jLoggerProvider: FactoryProvider<LoggerFunction> = {
    provide: NEO4J_LOGGER_PROVIDER,
    useFactory: () => {
        const logger = new Logger('Neo4j DB');

        return ((level, message) => {
            if (level === 'debug') {
                logger.debug(message);
            } else if (level === 'info') {
                logger.log(message);
            } else if (level === 'warn') {
                logger.warn(message);
            } else if (level === 'error') {
                logger.error(message);
            }
        }) satisfies LoggerFunction;
    },
};
