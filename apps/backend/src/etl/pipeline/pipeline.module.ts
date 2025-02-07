import { Module } from '@nestjs/common';
import { PipelineService } from './pipeline.service.js';
import { PipelineExecutionService } from './pipeline-execution.service.js';
import { PipelineBlueprintModule } from './blueprint/pipeline-blueprint.module.js';
import { PipelineModuleModule } from './pipeline-module/pipeline-module.module.js';
import { PipelineExecutionController } from './pipeline-execution.controller.js';
import { PipelineTriggerService } from './pipeline-trigger.service.js';

@Module({
    imports: [PipelineBlueprintModule, PipelineModuleModule],
    controllers: [PipelineExecutionController],
    providers: [PipelineService, PipelineExecutionService, PipelineTriggerService],
    exports: [PipelineService, PipelineExecutionService, PipelineTriggerService],
})
export class PipelineModule {}
