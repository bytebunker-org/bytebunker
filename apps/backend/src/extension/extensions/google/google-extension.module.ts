import { Module } from '@nestjs/common';
import { TransformSemanticLocationHistoryPipelineModule } from './pipeline-module/transform-semantic-location-history.pipeline-module.js';
import { AssetModule } from '../../../etl/asset/asset.module.js';

@Module({
    imports: [AssetModule],
    controllers: [],
    providers: [TransformSemanticLocationHistoryPipelineModule],
})
export class GoogleExtensionModule {}
