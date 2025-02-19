import { Module } from '@nestjs/common';
import { neo4jLoggerProvider } from './neo4j-logger.provider.js';
import { neodeProvider } from './neode.provider.js';
import { NEODE_PROVIDER } from './neode.constant.js';

@Module({
    providers: [neodeProvider, neo4jLoggerProvider],
    exports: [NEODE_PROVIDER],
})
export class GraphDatabaseModule {}
