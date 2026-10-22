import { Module } from '@nestjs/common';
import { AssetModule } from '../../../etl/asset/asset.module.js';
import { ActivityGraphModule } from '../../../activity-graph/activity-graph.module.js';
import { TransformAirbnbExportPipelineModule } from './pipeline-module/transform-airbnb-export.pipeline-module.js';

@Module({
    imports: [AssetModule, ActivityGraphModule],
    providers: [TransformAirbnbExportPipelineModule],
})
export class AirbnbExtensionModule {}
