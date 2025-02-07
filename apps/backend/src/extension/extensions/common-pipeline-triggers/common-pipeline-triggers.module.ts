import { Module } from '@nestjs/common';
import { LocalFileTriggerPipelineModule } from './pipeline-module/local-file-trigger.pipeline-module.js';
import { LocalFileTriggerService } from './local-file-trigger.service.js';
import { PipelineModule } from '../../../etl/pipeline/pipeline.module.js';
import { AssetModule } from '../../../etl/asset/asset.module.js';

@Module({
    imports: [PipelineModule, AssetModule],
    providers: [LocalFileTriggerService, LocalFileTriggerPipelineModule],
})
export class CommonPipelineTriggersModule {}
