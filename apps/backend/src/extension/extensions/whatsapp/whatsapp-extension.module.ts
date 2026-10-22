import { Module } from '@nestjs/common';
import { AssetModule } from '../../../etl/asset/asset.module.js';
import { ActivityGraphModule } from '../../../activity-graph/activity-graph.module.js';
import { ParseWhatsappChatPipelineModule } from './pipeline-module/parse-whatsapp-chat.pipeline-module.js';

@Module({
    imports: [AssetModule, ActivityGraphModule],
    providers: [ParseWhatsappChatPipelineModule],
})
export class WhatsappExtensionModule {}
