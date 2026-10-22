import { Module } from '@nestjs/common';
import { AssetModule } from '../../../etl/asset/asset.module.js';
import { ActivityGraphModule } from '../../../activity-graph/activity-graph.module.js';
import { TransformBrowserDatabasePipelineModule } from './pipeline-module/transform-browser-database.pipeline-module.js';
import { TransformChromeTakeoutHistoryPipelineModule } from './pipeline-module/transform-chrome-takeout-history.pipeline-module.js';
import { TransformBookmarksHtmlPipelineModule } from './pipeline-module/transform-bookmarks-html.pipeline-module.js';

@Module({
    imports: [AssetModule, ActivityGraphModule],
    providers: [
        TransformBrowserDatabasePipelineModule,
        TransformChromeTakeoutHistoryPipelineModule,
        TransformBookmarksHtmlPipelineModule,
    ],
})
export class BrowserHistoryExtensionModule {}
