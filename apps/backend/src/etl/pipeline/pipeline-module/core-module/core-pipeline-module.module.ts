import { Module, type Type } from '@nestjs/common';
import { AbortExecutionPipelineModule } from './abort-execution.pipeline-module.js';
import type { IPipelineModule } from '../type/pipeline-module.interface.js';

@Module({
    providers: [AbortExecutionPipelineModule] satisfies Type<IPipelineModule<unknown, unknown>>[],
})
export class CorePipelineModuleModule {}
