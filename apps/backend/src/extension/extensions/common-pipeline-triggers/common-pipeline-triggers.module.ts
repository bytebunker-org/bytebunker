import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { LocalFileTriggerPipelineModule } from './pipeline-module/local-file-trigger.pipeline-module.js';
import { LocalFileTriggerService } from './local-file-trigger.service.js';
import { PipelineModule } from '../../../etl/pipeline/pipeline.module.js';
import { AssetModule } from '../../../etl/asset/asset.module.js';
import { PipelineExecutionModule } from '../../../etl/pipeline/execution/pipeline-execution.module.js';
import { PipelineModuleModule } from '../../../etl/pipeline/pipeline-module/pipeline-module.module.js';
import { FileImportService } from './file-import.service.js';
import { FileImportController } from './file-import.controller.js';
import { ScheduleTriggerPipelineModule } from './pipeline-module/schedule-trigger.pipeline-module.js';
import { ScheduleTriggerService } from './schedule-trigger.service.js';
import { ScheduleTriggerConsumer } from './schedule-trigger.consumer.js';
import { ScheduleTriggerController } from './schedule-trigger.controller.js';
import { SCHEDULE_TRIGGER_QUEUE } from './schedule-trigger.util.js';

@Module({
    imports: [
        PipelineModule,
        PipelineExecutionModule,
        PipelineModuleModule,
        AssetModule,
        BullModule.registerQueue({ name: SCHEDULE_TRIGGER_QUEUE }),
    ],
    controllers: [FileImportController, ScheduleTriggerController],
    providers: [
        LocalFileTriggerService,
        LocalFileTriggerPipelineModule,
        FileImportService,
        ScheduleTriggerPipelineModule,
        ScheduleTriggerService,
        ScheduleTriggerConsumer,
    ],
    exports: [FileImportService, ScheduleTriggerService],
})
export class CommonPipelineTriggersModule {}
