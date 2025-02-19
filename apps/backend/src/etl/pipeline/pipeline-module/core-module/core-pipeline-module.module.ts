import { Module, type Type } from '@nestjs/common';
import { AbortExecutionPipelineModule } from './abort-execution.pipeline-module.js';
import type { IPipelineModule } from '../type/pipeline-module.interface.js';
import { StoreActivityPipelineModule } from './store-activity.pipeline-module.js';
import { ActivityGraphModule } from '../../../../activity-graph/activity-graph.module.js';
import { AssetModule } from '../../../asset/asset.module.js';

@Module({
    imports: [AssetModule, ActivityGraphModule],
    providers: [AbortExecutionPipelineModule, StoreActivityPipelineModule] satisfies Type<
        IPipelineModule<unknown, unknown>
    >[],
})
export class CorePipelineModuleModule {}
