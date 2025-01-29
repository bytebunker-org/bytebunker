import { Module } from '@nestjs/common';
import { PipelineService } from './pipeline.service.js';
import { PipelineExecutionService } from './pipeline-execution.service.js';
import { PipelineBlueprintModule } from './blueprint/pipeline-blueprint.module.js';
import { PipelineModuleModule } from './pipeline-module/pipeline-module.module.js';
import { PipelineExecutionController } from './pipeline-execution.controller.js';

@Module({
    imports: [PipelineBlueprintModule, PipelineModuleModule],
    controllers: [PipelineExecutionController],
    providers: [PipelineService, PipelineExecutionService],
    exports: [PipelineService, PipelineExecutionService],
})
export class PipelineModule {}
