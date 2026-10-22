import { Module } from '@nestjs/common';
import { AssetModule } from '../../../etl/asset/asset.module.js';
import { PipelineExecutionModule } from '../../../etl/pipeline/execution/pipeline-execution.module.js';
import { AppConfig } from '../../../util/config/app.config.js';
import { MY_HUB_CONFIG, MyHubClientService } from './my-hub-client.service.js';
import type { MyHubConfig } from './my-hub.config.js';
import { MyHubSyncTriggerService } from './my-hub-sync-trigger.service.js';
import { MyHubSyncController } from './my-hub-sync.controller.js';
import { MyHubSyncTriggerPipelineModule } from './pipeline-module/my-hub-sync-trigger.pipeline-module.js';
import { SyncPersonsPipelineModule } from './pipeline-module/sync-persons.pipeline-module.js';
import { FetchCalendarFeedPipelineModule } from './pipeline-module/fetch-calendar-feed.pipeline-module.js';

@Module({
    imports: [AssetModule, PipelineExecutionModule],
    controllers: [MyHubSyncController],
    providers: [
        {
            provide: MY_HUB_CONFIG,
            useFactory: (appConfig: AppConfig): MyHubConfig | null => appConfig.myHub ?? null,
            inject: [AppConfig],
        },
        MyHubClientService,
        MyHubSyncTriggerService,
        MyHubSyncTriggerPipelineModule,
        SyncPersonsPipelineModule,
        FetchCalendarFeedPipelineModule,
    ],
})
export class MyHubExtensionModule {}
