import { Module } from '@nestjs/common';
import { PipelineService } from './pipeline.service.js';
import { PipelineBlueprintModule } from './blueprint/pipeline-blueprint.module.js';
import { PipelineModuleModule } from './pipeline-module/pipeline-module.module.js';
import { PipelineController } from './pipeline.controller.js';
import { PipelineExecutionModule } from './execution/pipeline-execution.module.js';

@Module({
    imports: [PipelineBlueprintModule, PipelineModuleModule, PipelineExecutionModule],
    controllers: [PipelineController],
    providers: [PipelineService],
    exports: [PipelineService],
})
export class PipelineModule {}
