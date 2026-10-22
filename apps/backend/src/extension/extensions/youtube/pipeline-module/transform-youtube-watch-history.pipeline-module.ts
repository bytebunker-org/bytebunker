import { Items, Required } from 'ts-decorator-json-schema-generator';
import { Logger } from '@nestjs/common';
import { DateTime } from 'luxon';
import { YouTubeProductEnum } from '@bytebunker/event-schema/extension/youtube';
import { AssetDto } from '../../../../etl/asset/dto/asset.dto.js';
import { ActivityDto } from '../../../../activity-graph/dto/activity.dto.js';
import { AssetService } from '../../../../etl/asset/asset.service.js';
import { ActivityStableKeyService } from '../../../../activity-graph/activity-stable-key.service.js';
import { ActivityGraphService } from '../../../../activity-graph/activity-graph.service.js';
import { ActivityGraphNodeService } from '../../../../activity-graph/activity-graph-node.service.js';
import { PipelineModule } from '../../../../etl/pipeline/pipeline-module/decorator/pipeline-module.decorator.js';
import { PipelineModuleJsonSchema } from '../../../../etl/pipeline/pipeline-module/decorator/pipeline-module-json-schema.decorator.js';
import type {
    IPipelineModule,
    PipelineModuleExecutionContext,
} from '../../../../etl/pipeline/pipeline-module/type/pipeline-module.interface.js';
import { YOUTUBE_EXTENSION, YOUTUBE_EXTENSION_ID } from '../../local-extension.constant.js';
import { parseYouTubeWatchHistory } from '../util/youtube-watch-history.parser.js';
import { looksLikeTakeoutActivityHtml } from '../../google/util/google-activity-html.parser.js';
import type { FileDetection, FileSample } from '../../../../etl/import/type/file-detection.interface.js';
import {
    buildYouTubeListenActivity,
    buildYouTubeViewActivity,
    type YouTubeActivityBuildContext,
} from '../util/youtube-activity.builder.js';

@PipelineModuleJsonSchema()
export class TransformYouTubeWatchHistoryInput {
    @Required()
    public rawHtml!: AssetDto;
}

@PipelineModuleJsonSchema()
export class TransformYouTubeWatchHistoryOutput {
    @Required()
    @Items(ActivityDto)
    public activities!: ActivityDto[];
}

@PipelineModule({
    extensionName: YOUTUBE_EXTENSION,
    inputType: TransformYouTubeWatchHistoryInput,
    outputType: TransformYouTubeWatchHistoryOutput,
})
export class TransformYouTubeWatchHistoryPipelineModule
    implements IPipelineModule<TransformYouTubeWatchHistoryInput, TransformYouTubeWatchHistoryOutput>
{
    private readonly logger = new Logger(TransformYouTubeWatchHistoryPipelineModule.name);

    constructor(
        private readonly assetService: AssetService,
        private readonly activityStableKeyService: ActivityStableKeyService,
        private readonly activityGraphService: ActivityGraphService,
        private readonly activityGraphNodeService: ActivityGraphNodeService,
    ) {}

    public detectFile(sample: FileSample): FileDetection | undefined {
        if (sample.extension !== 'html') {
            return undefined;
        }

        const isWatchHistoryName = /^(watch-history|wiedergabeverlauf)\.html$/i.test(sample.fileName);

        if (isWatchHistoryName && looksLikeTakeoutActivityHtml(sample.head)) {
            return { confidence: 0.95, format: 'YouTube watch history (Google Takeout)' };
        }

        if (!/youtube\.com\/watch\?v=/.test(sample.head)) {
            return undefined;
        }

        // "My Activity" exports and the search history use the same HTML; their own importers claim them.
        if (
            /my activity|meine aktivit/i.test(sample.relativePath) ||
            /search-history|suchverlauf/i.test(sample.fileName)
        ) {
            return { confidence: 0.3, format: 'Google My Activity (YouTube)' };
        }

        return {
            confidence: isWatchHistoryName ? 0.95 : 0.7,
            format: 'YouTube watch history (Google Takeout)',
        };
    }

    public async executeModule({
        em,
        inputData,
        progress,
    }: PipelineModuleExecutionContext<TransformYouTubeWatchHistoryInput>): Promise<TransformYouTubeWatchHistoryOutput> {
        const generatorExtensionObject = await this.activityGraphNodeService.getExtension(em, YOUTUBE_EXTENSION_ID);
        const ownerActor = await this.activityGraphService.getOwnerActor(em);
        const actorId = ownerActor.get('id')!;

        progress.message('Reading watch history');
        const rawHtml = await this.assetService.getAssetString(em, inputData.rawHtml);
        progress.message('Parsing HTML');
        const entries = parseYouTubeWatchHistory(rawHtml, this.logger);
        progress.report({
            current: 0,
            total: entries.length,
            unit: 'entries',
            message: `Found ${entries.length} entries`,
        });

        this.logger.log(`Parsed ${entries.length} YouTube watch history entries`);

        const context: YouTubeActivityBuildContext = {
            stableKeyService: this.activityStableKeyService,
            generator: generatorExtensionObject,
            actorId,
        };
        const activities: ActivityDto[] = [];

        for (const entry of entries) {
            const watchedAt = DateTime.fromISO(entry.watchedAt, { setZone: true });

            if (!watchedAt.isValid) {
                continue;
            }

            const activity =
                entry.product === YouTubeProductEnum.YOUTUBE_MUSIC
                    ? buildYouTubeListenActivity(entry, watchedAt, context)
                    : buildYouTubeViewActivity(entry, watchedAt, context);

            activities.push(activity as unknown as ActivityDto);
        }

        return { activities };
    }
}
