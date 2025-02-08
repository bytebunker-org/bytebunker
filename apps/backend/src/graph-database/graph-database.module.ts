import { Module } from '@nestjs/common';
import { neo4jLoggerProvider } from './neo4j-logger.provider.js';

@Module({
    providers: [neo4jLoggerProvider],
})
export class GraphDatabaseModule {}
