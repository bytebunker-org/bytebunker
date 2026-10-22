import { Module } from '@nestjs/common';
import { AssetModule } from '../../../etl/asset/asset.module.js';
import { ActivityGraphModule } from '../../../activity-graph/activity-graph.module.js';
import { TransformSpotifyStreamingHistoryPipelineModule } from './pipeline-module/transform-spotify-streaming-history.pipeline-module.js';

@Module({
    imports: [AssetModule, ActivityGraphModule],
    providers: [TransformSpotifyStreamingHistoryPipelineModule],
})
export class SpotifyExtensionModule {}
