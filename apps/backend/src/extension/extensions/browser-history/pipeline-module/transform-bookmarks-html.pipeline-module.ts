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
import { NETSCAPE_BOOKMARK_DOCTYPE, parseNetscapeBookmarks } from '../util/netscape-bookmarks.parser.js';
import { BrowserActivityBuilder } from '../util/browser-activity.builder.js';

@PipelineModuleJsonSchema()
export class TransformBookmarksHtmlInput {
    @Required()
    public bookmarksFile!: AssetDto;

    /**
     * Browser stored on every bookmark (firefox, chrome, chromium). Defaults to chrome for files from a Takeout
     * `Chrome/` folder and is left out otherwise.
     */
    @Optional()
    public browser?: string;

    @Optional()
    public profileName?: string;
}

@PipelineModuleJsonSchema()
export class TransformBookmarksHtmlOutput {
    @Required()
    @Items(ActivityDto)
    public activities!: ActivityDto[];
}

/**
 * Imports a Netscape bookmark file: Google Takeout `Chrome/Lesezeichen.html` / `Bookmarks.html`, `Leseliste.html`
 * (reading list), or a bookmark HTML export from Chrome or Firefox. Each link becomes Add + Bookmark of a Page at its
 * ADD_DATE with the folder path; links without ADD_DATE are skipped. Same identity as Firefox bookmarks from
 * places.sqlite (`browser:bookmark:<url>:<ms>`).
 */
@PipelineModule({
    extensionName: BROWSER_HISTORY_EXTENSION,
    inputType: TransformBookmarksHtmlInput,
    outputType: TransformBookmarksHtmlOutput,
})
export class TransformBookmarksHtmlPipelineModule
    implements IPipelineModule<TransformBookmarksHtmlInput, TransformBookmarksHtmlOutput>
{
    private readonly logger = new Logger(TransformBookmarksHtmlPipelineModule.name);

    constructor(
        private readonly assetService: AssetService,
        private readonly activityGraphService: ActivityGraphService,
        private readonly activityGraphNodeService: ActivityGraphNodeService,
    ) {}

    public detectFile(sample: FileSample): FileDetection | undefined {
        if (!NETSCAPE_BOOKMARK_DOCTYPE.test(sample.head.slice(0, 1024))) {
            return undefined;
        }

        return { confidence: 0.97, format: 'Bookmarks (Netscape bookmark HTML)' };
    }

    public async executeModule({
        em,
        inputData,
        progress,
    }: PipelineModuleExecutionContext<TransformBookmarksHtmlInput>): Promise<TransformBookmarksHtmlOutput> {
        const generator = await this.activityGraphNodeService.getExtension(em, BROWSER_HISTORY_EXTENSION_ID);
        const ownerActor = await this.activityGraphService.getOwnerActor(em);
        const actorId = ownerActor.get('id')!;
        const asset = inputData.bookmarksFile;
        const originalPath = asset.metadata?.['Original-File-Path'] ?? asset.originalFilename;

        progress.message('Reading bookmarks');
        const html = await this.assetService.getAssetString(em, asset);
        const browser =
            Object.values(BrowserEnum).find((value) => value === inputData.browser?.toLowerCase()) ??
            (/(^|\/)chrome\//i.test(originalPath ?? '') ? BrowserEnum.CHROME : undefined);
        const builder = this.transformBookmarks(html, generator, actorId, browser, inputData.profileName);

        progress.report({
            current: builder.activities.length,
            total: builder.activities.length,
            unit: 'bookmarks',
            message: `${builder.stats.bookmarksImported} bookmarks`,
        });
        this.logger.log(`Bookmarks ${originalPath}: ${builder.summary()}`);

        return { activities: builder.activities };
    }

    public transformBookmarks(
        html: string,
        generator: ASObject,
        actorId: string,
        browser?: BrowserEnum,
        profileName?: string,
    ): BrowserActivityBuilder {
        const { bookmarks, invalid } = parseNetscapeBookmarks(html);
        const builder = new BrowserActivityBuilder({ generator, actorId, browser, profileName });

        builder.stats.invalidRows += invalid;
        builder.addBookmarks(bookmarks);

        return builder;
    }
}
