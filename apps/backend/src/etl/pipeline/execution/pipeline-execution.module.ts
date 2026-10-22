import { Module } from '@nestjs/common';
import { PipelineExecutionController } from './pipeline-execution.controller.js';
import { PipelineExecutionService } from './pipeline-execution.service.js';
import { PipelineTriggerService } from './pipeline-trigger.service.js';
import { PipelineModuleModule } from '../pipeline-module/pipeline-module.module.js';
import { ContinuePipelineExecutionConsumer } from './continue-pipeline-execution.consumer.js';
import { PipelineSingleModuleExecutionConsumer } from './pipeline-single-module-execution.consumer.js';
import { QueueModule } from '../../../queue/queue.module.js';
import { StartPipelineExecutionConsumer } from './start-pipeline-execution.consumer.js';
import { PipelineExecutionLogController } from './pipeline-execution-log.controller.js';
import { PipelineProgressService } from '../progress/pipeline-progress.service.js';
import { RedisModule } from '../../../shared/redis/redis.module.js';

@Module({
    imports: [QueueModule, PipelineModuleModule, RedisModule],
    controllers: [PipelineExecutionController, PipelineExecutionLogController],
    providers: [
        PipelineExecutionService,
        PipelineTriggerService,
        ContinuePipelineExecutionConsumer,
        PipelineSingleModuleExecutionConsumer,
        StartPipelineExecutionConsumer,
        PipelineProgressService,
    ],
    exports: [PipelineExecutionService, PipelineTriggerService, PipelineProgressService],
})
export class PipelineExecutionModule {}
