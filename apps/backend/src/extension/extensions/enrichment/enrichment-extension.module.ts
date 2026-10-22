import { Module, type Type } from '@nestjs/common';
import { ActivityGraphModule } from '../../../activity-graph/activity-graph.module.js';
import { GraphDatabaseModule } from '../../../activity-graph/graph-database/graph-database.module.js';
import type { IPipelineModule } from '../../../etl/pipeline/pipeline-module/type/pipeline-module.interface.js';
import { DerivedGraphService } from './graph/derived-graph.service.js';
import { ConsolidatePlacesPipelineModule } from './pipeline-module/consolidate-places.pipeline-module.js';
import { DeriveHomeWorkPipelineModule } from './pipeline-module/derive-home-work.pipeline-module.js';

const pipelineModules = [ConsolidatePlacesPipelineModule, DeriveHomeWorkPipelineModule] satisfies Type<
    IPipelineModule<unknown, unknown>
>[];

/** Modules that derive data from the graph (canonical places, home/work periods, …) instead of importing it. */
@Module({
    imports: [GraphDatabaseModule, ActivityGraphModule],
    providers: [DerivedGraphService, ...pipelineModules],
    exports: [DerivedGraphService],
})
export class EnrichmentExtensionModule {}
