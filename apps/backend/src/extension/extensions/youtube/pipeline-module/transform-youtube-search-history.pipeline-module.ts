import { Items, Required } from 'ts-decorator-json-schema-generator';
import { Logger } from '@nestjs/common';
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
import type { FileDetection, FileSample } from '../../../../etl/import/type/file-detection.interface.js';
import { YOUTUBE_EXTENSION, YOUTUBE_EXTENSION_ID } from '../../local-extension.constant.js';
import {
    looksLikeTakeoutActivityHtml,
    parseGoogleActivityHtml,
} from '../../google/util/google-activity-html.parser.js';
import { GoogleActivityMapper, mapGoogleActivityEntries } from '../../google/util/google-activity.mapper.js';

@PipelineModuleJsonSchema()
export class TransformYouTubeSearchHistoryInput {
    @Required()
    public rawHtml!: AssetDto;
}

@PipelineModuleJsonSchema()
export class TransformYouTubeSearchHistoryOutput {
    @Required()
    @Items(ActivityDto)
    public activities!: ActivityDto[];
}

/**
 * Imports the Takeout YouTube search history (`YouTube und YouTube Music/Verlauf/Suchverlauf.html`,
 * `YouTube and YouTube Music/history/search-history.html`) as `Search` activities. The file uses the "My Activity"
 * card layout and the same entries also appear in `My Activity/YouTube`, so both imports build identical stable
 * keys through {@link GoogleActivityMapper}.
 */
@PipelineModule({
    extensionName: YOUTUBE_EXTENSION,
    inputType: TransformYouTubeSearchHistoryInput,
    outputType: TransformYouTubeSearchHistoryOutput,
})
export class TransformYouTubeSearchHistoryPipelineModule
    implements IPipelineModule<TransformYouTubeSearchHistoryInput, TransformYouTubeSearchHistoryOutput>
{
    private readonly logger = new Logger(TransformYouTubeSearchHistoryPipelineModule.name);

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

        const isSearchHistoryName = /^(search-history|suchverlauf)\.html$/i.test(sample.fileName);
        const isActivityHtml = looksLikeTakeoutActivityHtml(sample.head);

        if (isSearchHistoryName && isActivityHtml && /youtube/i.test(sample.relativePath)) {
            return { confidence: 0.95, format: 'YouTube search history (Google Takeout)' };
        }

        if (isSearchHistoryName && /youtube\.com\/results\?search_query=/.test(sample.head)) {
            return { confidence: 0.9, format: 'YouTube search history (Google Takeout)' };
        }

        return undefined;
    }

    public async executeModule({
        em,
        inputData,
        progress,
    }: PipelineModuleExecutionContext<TransformYouTubeSearchHistoryInput>): Promise<TransformYouTubeSearchHistoryOutput> {
        const generatorExtensionObject = await this.activityGraphNodeService.getExtension(em, YOUTUBE_EXTENSION_ID);
        const ownerActor = await this.activityGraphService.getOwnerActor(em);
        const actorId = ownerActor.get('id')!;

        progress.message('Reading search history');
        const html = await this.assetService.getAssetString(em, inputData.rawHtml);
        progress.message('Parsing HTML');
        const parsed = parseGoogleActivityHtml(html);
        progress.report({ current: 0, total: parsed.entries.length, unit: 'entries', message: 'Building activities' });

        const mapper = new GoogleActivityMapper(this.activityStableKeyService, generatorExtensionObject, actorId);
        const { activities, duplicates, unmapped } = mapGoogleActivityEntries(mapper, parsed.entries);

        const skipped = Object.values(parsed.skipped).reduce((sum, count) => sum + count, 0) + unmapped;
        this.logger.log(
            `YouTube search history: ${activities.length} of ${parsed.total} entries imported, ${duplicates} ` +
                `identical repeats dropped, ${skipped} skipped`,
        );
        progress.report({
            current: parsed.total,
            total: parsed.total,
            unit: 'entries',
            message: `${activities.length} searches, ${skipped} skipped`,
        });

        return { activities: activities as unknown as ActivityDto[] };
    }
}
