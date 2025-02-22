import { Module } from '@nestjs/common';
import { ActivityGraphSearchService } from './activity-graph-search.service.js';
import { ActivityGraphSearchController } from './activity-graph-search.controller.js';
import { GraphDatabaseModule } from '../graph-database/graph-database.module.js';
import { ActivityGraphModule } from '../activity-graph.module.js';

@Module({
    imports: [GraphDatabaseModule, ActivityGraphModule],
    controllers: [ActivityGraphSearchController],
    providers: [ActivityGraphSearchService],
    exports: [ActivityGraphSearchService],
})
export class ActivityGraphSearchModule {}
