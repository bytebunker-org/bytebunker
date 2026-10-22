import { Module } from '@nestjs/common';
import { LocalFileTriggerPipelineModule } from './pipeline-module/local-file-trigger.pipeline-module.js';
import { LocalFileTriggerService } from './local-file-trigger.service.js';
import { PipelineModule } from '../../../etl/pipeline/pipeline.module.js';
import { AssetModule } from '../../../etl/asset/asset.module.js';
import { PipelineExecutionModule } from '../../../etl/pipeline/execution/pipeline-execution.module.js';
import { PipelineModuleModule } from '../../../etl/pipeline/pipeline-module/pipeline-module.module.js';
import { FileImportService } from './file-import.service.js';
import { FileImportController } from './file-import.controller.js';

@Module({
    imports: [PipelineModule, PipelineExecutionModule, PipelineModuleModule, AssetModule],
    controllers: [FileImportController],
    providers: [LocalFileTriggerService, LocalFileTriggerPipelineModule, FileImportService],
    exports: [FileImportService],
})
export class CommonPipelineTriggersModule {}
