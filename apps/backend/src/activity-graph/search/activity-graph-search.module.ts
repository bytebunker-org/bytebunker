import { CoverageController } from '../coverage/coverage.controller.js';
import { CoverageService } from '../coverage/coverage.service.js';
import { ImportProvenanceController } from './import-provenance.controller.js';
import { Module } from '@nestjs/common';
import { ActivityGraphSearchService } from './activity-graph-search.service.js';
import { ActivityGraphSearchController } from './activity-graph-search.controller.js';
import { GraphDatabaseModule } from '../graph-database/graph-database.module.js';
import { ActivityGraphModule } from '../activity-graph.module.js';

@Module({
    imports: [GraphDatabaseModule, ActivityGraphModule],
    controllers: [ActivityGraphSearchController, ImportProvenanceController, CoverageController],
    providers: [ActivityGraphSearchService, CoverageService],
    exports: [ActivityGraphSearchService],
})
export class ActivityGraphSearchModule {}
