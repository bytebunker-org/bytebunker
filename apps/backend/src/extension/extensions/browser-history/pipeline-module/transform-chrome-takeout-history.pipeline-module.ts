import { Items, Optional, Required } from 'ts-decorator-json-schema-generator';
import { Logger } from '@nestjs/common';
import type { ASObject } from '@bytebunker/event-schema';
import { BrowserEnum } from '@bytebunker/event-schema/extension/browser-history';
import { AssetDto } from '../../../../etl/asset/dto/asset.dto.js';
import { ActivityDto } from '../../../../activity-graph/dto/activity.dto.js';
import { AssetService } from '../../../../etl/asset/asset.service.js';
import { ActivityGraphService } from '../../../../activity-graph/activity-graph.service.js';
import { ActivityGraphNodeService } from '../../../../activity-graph/activity-graph-node.service.js';
import { PipelineModule } from '../../../../etl/pipeline/pipeline-module/decorator/pipeline-module.decorator.js';
import { PipelineModuleJsonSchema } from '../../../../etl/pipeline/pipeline-module/decorator/pipeline-module-json-schema.decorator.js';
import type {
    IPipelineModule,
    PipelineModuleExecutionContext,
} from '../../../../etl/pipeline/pipeline-module/type/pipeline-module.interface.js';
import type { FileDetection, FileSample } from '../../../../etl/import/type/file-detection.interface.js';
import { BROWSER_HISTORY_EXTENSION, BROWSER_HISTORY_EXTENSION_ID } from '../../local-extension.constant.js';
import { parseChromeTakeoutHistory } from '../util/chrome-takeout-history.parser.js';
import { BrowserActivityBuilder } from '../util/browser-activity.builder.js';

@PipelineModuleJsonSchema()
export class TransformChromeTakeoutHistoryInput {
    @Required()
    public historyFile!: AssetDto;

    /** Profile name stored on every activity, e.g. the Google account. Not set by default. */
    @Optional()
    public profileName?: string;
}

@PipelineModuleJsonSchema()
export class TransformChromeTakeoutHistoryOutput {
    @Required()
    @Items(ActivityDto)
    public activities!: ActivityDto[];
}

/**
 * Imports Chrome history from Google Takeout: `Chrome/Verlauf.json` (German export) or `Chrome/BrowserHistory.json`
 * (English), one row per synced visit. Same activity shape and identity as the History database import, so a visit
 * present in both dedupes. Reloads and subframes are dropped where the export still names the transition (2019/2020
 * exports); browser-internal URLs are skipped.
 */
@PipelineModule({
    extensionName: BROWSER_HISTORY_EXTENSION,
    inputType: TransformChromeTakeoutHistoryInput,
    outputType: TransformChromeTakeoutHistoryOutput,
})
export class TransformChromeTakeoutHistoryPipelineModule
    implements IPipelineModule<TransformChromeTakeoutHistoryInput, TransformChromeTakeoutHistoryOutput>
{
    private readonly logger = new Logger(TransformChromeTakeoutHistoryPipelineModule.name);

    constructor(
        private readonly assetService: AssetService,
        private readonly activityGraphService: ActivityGraphService,
        private readonly activityGraphNodeService: ActivityGraphNodeService,
    ) {}

    public detectFile(sample: FileSample): FileDetection | undefined {
        if (sample.extension !== 'json' || !/^\s*{\s*"Browser History"\s*:/.test(sample.head)) {
            return undefined;
        }

        return {
            confidence: /^(verlauf|browserhistory)\.json$/i.test(sample.fileName) ? 0.97 : 0.9,
            format: 'Chrome history (Google Takeout)',
        };
    }

    public async executeModule({
        em,
        inputData,
        progress,
    }: PipelineModuleExecutionContext<TransformChromeTakeoutHistoryInput>): Promise<TransformChromeTakeoutHistoryOutput> {
        const generator = await this.activityGraphNodeService.getExtension(em, BROWSER_HISTORY_EXTENSION_ID);
        const ownerActor = await this.activityGraphService.getOwnerActor(em);
        const actorId = ownerActor.get('id')!;

        progress.message('Reading Chrome history');
        const json = await this.assetService.getAssetString(em, inputData.historyFile);
        const builder = this.transformHistory(json, generator, actorId, inputData.profileName);

        progress.report({
            current: builder.activities.length,
            total: builder.activities.length,
            unit: 'activities',
            message: `${builder.stats.visitsImported} visits`,
        });
        this.logger.log(`Chrome Takeout history ${inputData.historyFile.originalFilename}: ${builder.summary()}`);

        return { activities: builder.activities };
    }

    public transformHistory(
        json: string,
        generator: ASObject,
        actorId: string,
        profileName?: string,
    ): BrowserActivityBuilder {
        const { visits, invalid } = parseChromeTakeoutHistory(json);
        const builder = new BrowserActivityBuilder({ generator, actorId, browser: BrowserEnum.CHROME, profileName });

        builder.stats.invalidRows += invalid;
        builder.addVisits(visits);

        return builder;
    }
}
