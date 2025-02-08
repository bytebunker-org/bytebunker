import { Module } from '@nestjs/common';
import { PipelineExecutionController } from './pipeline-execution.controller.js';
import { PipelineExecutionService } from './pipeline-execution.service.js';
import { PipelineTriggerService } from './pipeline-trigger.service.js';
import { PipelineModuleModule } from '../pipeline-module/pipeline-module.module.js';
import { PipelineExecutionConsumer } from './pipeline-execution.consumer.js';
import { PipelineSingleModuleExecutionConsumer } from './pipeline-single-module-execution.consumer.js';
import { QueueModule } from '../../../queue/queue.module.js';

@Module({
    imports: [QueueModule, PipelineModuleModule],
    controllers: [PipelineExecutionController],
    providers: [
        PipelineExecutionService,
        PipelineTriggerService,
        PipelineExecutionConsumer,
        PipelineSingleModuleExecutionConsumer,
    ],
    exports: [PipelineExecutionService, PipelineTriggerService],
})
export class PipelineExecutionModule {}
