import { Module } from '@nestjs/common';
import { neo4jLoggerProvider } from './neo4j-logger.provider.js';
import { neodeProvider } from './neode.provider.js';
import { NEODE_PROVIDER } from './neode.constant.js';
import { GraphSchemaBootstrapService } from './graph-schema-bootstrap.service.js';

@Module({
    providers: [neodeProvider, neo4jLoggerProvider, GraphSchemaBootstrapService],
    exports: [NEODE_PROVIDER, GraphSchemaBootstrapService],
})
export class GraphDatabaseModule {}
