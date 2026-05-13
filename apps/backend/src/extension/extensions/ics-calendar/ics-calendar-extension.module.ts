import { Module } from '@nestjs/common';
import { AssetModule } from '../../../etl/asset/asset.module.js';
import { ActivityGraphModule } from '../../../activity-graph/activity-graph.module.js';
import { ParseIcsFilePipelineModule } from './pipeline-module/parse-ics-file.pipeline-module.js';

@Module({
    imports: [AssetModule, ActivityGraphModule],
    providers: [ParseIcsFilePipelineModule],
})
export class IcsCalendarExtensionModule {}
