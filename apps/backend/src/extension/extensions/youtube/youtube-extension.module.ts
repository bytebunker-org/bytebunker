import { Module } from '@nestjs/common';
import { AssetModule } from '../../../etl/asset/asset.module.js';
import { ActivityGraphModule } from '../../../activity-graph/activity-graph.module.js';
import { TransformYouTubeWatchHistoryPipelineModule } from './pipeline-module/transform-youtube-watch-history.pipeline-module.js';

@Module({
    imports: [AssetModule, ActivityGraphModule],
    providers: [TransformYouTubeWatchHistoryPipelineModule],
})
export class YouTubeExtensionModule {}
