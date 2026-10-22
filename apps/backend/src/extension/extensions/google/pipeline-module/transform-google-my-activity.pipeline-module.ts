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
import { GOOGLE_EXTENSION, GOOGLE_EXTENSION_ID } from '../../local-extension.constant.js';
import { looksLikeTakeoutActivityHtml, parseGoogleActivityHtml } from '../util/google-activity-html.parser.js';
import { GoogleActivityMapper, mapGoogleActivityEntries } from '../util/google-activity.mapper.js';

@PipelineModuleJsonSchema()
export class TransformGoogleMyActivityInput {
    @Required()
    public activityHtml!: AssetDto;
}

@PipelineModuleJsonSchema()
export class TransformGoogleMyActivityOutput {
    @Required()
    @Items(ActivityDto)
    public activities!: ActivityDto[];
}

/**
 * Imports one Takeout "My Activity" HTML file (`Meine Aktivitäten/<Produkt>/MeineAktivitäten.html`,
 * `My Activity/<Product>/MyActivity.html`): searches, page visits, app usage, Maps views and routes, YouTube views,
 * Assistant and Gemini prompts, ... See {@link GoogleActivityMapper} for the mapping.
 */
@PipelineModule({
    extensionName: GOOGLE_EXTENSION,
    inputType: TransformGoogleMyActivityInput,
    outputType: TransformGoogleMyActivityOutput,
})
export class TransformGoogleMyActivityPipelineModule
    implements IPipelineModule<TransformGoogleMyActivityInput, TransformGoogleMyActivityOutput>
{
    private readonly logger = new Logger(TransformGoogleMyActivityPipelineModule.name);

    constructor(
        private readonly assetService: AssetService,
        private readonly activityStableKeyService: ActivityStableKeyService,
        private readonly activityGraphService: ActivityGraphService,
        private readonly activityGraphNodeService: ActivityGraphNodeService,
    ) {}

    public detectFile(sample: FileSample): FileDetection | undefined {
        if (sample.extension !== 'html' || !looksLikeTakeoutActivityHtml(sample.head)) {
            return undefined;
        }

        const format = 'Google My Activity (Takeout HTML)';

        if (
            /^(meineaktivitäten|myactivity)\.html$/i.test(sample.fileName.normalize('NFC')) ||
            /(^|\/)(meine aktivitäten|my activity)\//i.test(sample.relativePath.normalize('NFC'))
        ) {
            return { confidence: 0.9, format };
        }

        // YouTube watch and search history have their own importers.
        if (
            /youtube/i.test(sample.relativePath) ||
            /^(watch-history|wiedergabeverlauf)\.html$/i.test(sample.fileName)
        ) {
            return { confidence: 0.3, format };
        }

        // Any other activity HTML (e.g. Maps `Suchverlauf.html`) has the same card layout.
        return { confidence: 0.6, format };
    }

    public async executeModule({
        em,
        inputData,
        progress,
    }: PipelineModuleExecutionContext<TransformGoogleMyActivityInput>): Promise<TransformGoogleMyActivityOutput> {
        const generatorExtensionObject = await this.activityGraphNodeService.getExtension(em, GOOGLE_EXTENSION_ID);
        const ownerActor = await this.activityGraphService.getOwnerActor(em);
        const actorId = ownerActor.get('id')!;

        progress.message('Reading activity file');
        const html = await this.assetService.getAssetString(em, inputData.activityHtml);
        const estimatedTotal = countOccurrences(html, '<div class="outer-cell');
        progress.report({ current: 0, total: estimatedTotal, unit: 'entries', message: 'Parsing entries' });

        const parsed = parseGoogleActivityHtml(html, {
            onProgress: (done) => progress.report({ current: done, total: estimatedTotal, unit: 'entries' }),
            progressInterval: 2000,
        });

        const mapper = new GoogleActivityMapper(this.activityStableKeyService, generatorExtensionObject, actorId);
        const { activities, duplicates, unmapped, byAction } = mapGoogleActivityEntries(mapper, parsed.entries);

        const skipped = Object.values(parsed.skipped).reduce((sum, count) => sum + count, 0) + unmapped;
        const product = parsed.entries[0]?.product ?? 'unknown product';
        this.logger.log(
            `My Activity (${product}): ${activities.length} of ${parsed.total} entries imported, ${duplicates} ` +
                `identical repeats dropped, ${skipped} skipped ` +
                `${JSON.stringify({ ...parsed.skipped, ...(unmapped ? { unmapped } : {}) })}; ${JSON.stringify(byAction)}`,
        );
        progress.report({
            current: parsed.total,
            total: parsed.total,
            unit: 'entries',
            message: `${activities.length} activities, ${skipped} skipped`,
        });

        return { activities: activities as unknown as ActivityDto[] };
    }
}

function countOccurrences(text: string, needle: string): number {
    let count = 0;

    for (let index = text.indexOf(needle); index !== -1; index = text.indexOf(needle, index + needle.length)) {
        count++;
    }

    return count;
}
