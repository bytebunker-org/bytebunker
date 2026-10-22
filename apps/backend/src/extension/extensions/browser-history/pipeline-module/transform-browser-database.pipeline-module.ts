import { Items, Optional, Required } from 'ts-decorator-json-schema-generator';
import { Logger } from '@nestjs/common';
import { DateTime } from 'luxon';
// eslint-disable-next-line n/no-unsupported-features/node-builtins -- available unflagged since Node 22.13, prod runs 22.22
import type { DatabaseSync } from 'node:sqlite';
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
import { hasSqliteMagic, readSqliteBuffer } from '../util/sqlite-file.util.js';
import { isFirefoxPlaces, readFirefoxBookmarks, readFirefoxVisits } from '../util/firefox-places.reader.js';
import { isChromeHistory, readChromeVisits } from '../util/chrome-history.reader.js';
import { BrowserActivityBuilder, type BrowserActivityContext } from '../util/browser-activity.builder.js';
import { profileNameFromPath } from '../util/browser-url.util.js';

export interface TransformBrowserDatabaseOptions {
    browser?: string;
    profileName?: string;
    includeBookmarks?: boolean;
    fromDate?: string;
    toDate?: string;
}

@PipelineModuleJsonSchema()
export class TransformBrowserDatabaseInput {
    @Required()
    public databaseFile!: AssetDto;

    /**
     * Profile name stored on every activity. Defaults to the folder the file was imported from, without Firefox's
     * random prefix (`h0f01llj.dev-edition-default` → `dev-edition-default`).
     */
    @Optional()
    public profileName?: string;

    /**
     * Browser stored on every activity: firefox, chrome or chromium. Firefox is recognised by its schema; Chromium
     * databases default to chrome unless the import path mentions chromium.
     */
    @Optional()
    public browser?: string;

    /** Import Firefox bookmarks from the same file. Defaults to true. */
    @Optional()
    public includeBookmarks?: boolean;

    /** Only visits at or after this ISO date/time. Splits very large profiles over several runs. */
    @Optional()
    public fromDate?: string;

    /** Only visits before this ISO date/time (exclusive). */
    @Optional()
    public toDate?: string;
}

@PipelineModuleJsonSchema()
export class TransformBrowserDatabaseOutput {
    @Required()
    @Items(ActivityDto)
    public activities!: ActivityDto[];
}

/**
 * Imports the history database of a browser profile: Firefox `places.sqlite` (visits and bookmarks) or
 * Chrome/Chromium `History` (visits). Read with Node's built-in `node:sqlite` from a temp copy of the asset.
 *
 * Getting a consistent copy: Firefox keeps recent writes in `places.sqlite-wal` until it checkpoints, and only the
 * `places.sqlite` file reaches this module (every imported file, also from a zip, is routed on its own). So either
 * copy `places.sqlite` while Firefox is closed (it checkpoints on exit), or make a snapshot of the running profile
 * with `sqlite3 ~/.mozilla/firefox/<profile>/places.sqlite ".backup places.sqlite"` and import that. A zip of the
 * profile folder works when Firefox was closed; its `-wal`/`-shm` files are then empty and simply not matched.
 * Chrome's `History` uses a rollback journal, copying it while Chrome is closed is enough.
 *
 * Every visit becomes a View + BrowserVisit of a Page, minus noise: redirect hops (only the page a redirect chain
 * ended on is kept), reloads, framed/subframe loads and browser-internal URLs. Downloads (Firefox) are kept with
 * visitType DOWNLOAD. Identity is `browser:visit:<normalised url>:<visit time in ms>`, so a visit that Firefox Sync
 * copied into another profile (stored rounded to the millisecond) dedupes against the original. Bookmarks become
 * Add + Bookmark with their folder path.
 */
@PipelineModule({
    extensionName: BROWSER_HISTORY_EXTENSION,
    inputType: TransformBrowserDatabaseInput,
    outputType: TransformBrowserDatabaseOutput,
})
export class TransformBrowserDatabasePipelineModule
    implements IPipelineModule<TransformBrowserDatabaseInput, TransformBrowserDatabaseOutput>
{
    private readonly logger = new Logger(TransformBrowserDatabasePipelineModule.name);

    constructor(
        private readonly assetService: AssetService,
        private readonly activityGraphService: ActivityGraphService,
        private readonly activityGraphNodeService: ActivityGraphNodeService,
    ) {}

    /**
     * Table names are not reliably inside the first 64 KB, so the file name decides which SQLite file is a browser
     * database: `places.sqlite` (Firefox) and `History` (Chrome, Chromium, Edge, Brave).
     */
    public detectFile(sample: FileSample): FileDetection | undefined {
        if (!hasSqliteMagic(sample.head)) {
            return undefined;
        }

        if (/^places.*\.sqlite$/i.test(sample.fileName)) {
            return { confidence: 0.97, format: 'Firefox history (places.sqlite)' };
        }

        if (sample.fileName === 'History') {
            return { confidence: 0.95, format: 'Chrome/Chromium history database' };
        }

        return undefined;
    }

    public async executeModule({
        em,
        inputData,
        progress,
    }: PipelineModuleExecutionContext<TransformBrowserDatabaseInput>): Promise<TransformBrowserDatabaseOutput> {
        const generator = await this.activityGraphNodeService.getExtension(em, BROWSER_HISTORY_EXTENSION_ID);
        const ownerActor = await this.activityGraphService.getOwnerActor(em);
        const actorId = ownerActor.get('id')!;
        const asset = inputData.databaseFile;
        const originalPath = asset.metadata?.['Original-File-Path'] ?? asset.originalFilename;

        progress.message('Reading database');
        const data = await this.assetService.getAsset(em, asset);
        progress.message('Reading visits');

        const builder = await readSqliteBuffer(data, asset.originalFilename || 'database.sqlite', (db) =>
            this.transformDatabase(db, generator, actorId, { ...inputData, originalPath }),
        );

        progress.report({
            current: builder.activities.length,
            total: builder.activities.length,
            unit: 'activities',
            message: `${builder.stats.visitsImported} visits, ${builder.stats.bookmarksImported} bookmarks`,
        });
        this.logger.log(`Browser database ${originalPath}: ${builder.summary()}`);

        return { activities: builder.activities };
    }

    public transformDatabase(
        db: DatabaseSync,
        generator: ASObject,
        actorId: string,
        options: TransformBrowserDatabaseOptions & { originalPath?: string },
    ): BrowserActivityBuilder {
        const isFirefox = isFirefoxPlaces(db);

        if (!isFirefox && !isChromeHistory(db)) {
            throw new Error('Neither a Firefox places.sqlite nor a Chrome History database');
        }

        const context: BrowserActivityContext = {
            generator,
            actorId,
            browser: resolveBrowser(options.browser, isFirefox, options.originalPath),
            profileName: options.profileName || profileNameFromPath(options.originalPath),
            fromUs: parseDateOption(options.fromDate, 'fromDate'),
            toUs: parseDateOption(options.toDate, 'toDate'),
        };
        const builder = new BrowserActivityBuilder(context);

        if (isFirefox) {
            builder.addVisits(readFirefoxVisits(db));

            if (options.includeBookmarks !== false) {
                builder.addBookmarks(readFirefoxBookmarks(db));
            }
        } else {
            builder.addVisits(readChromeVisits(db));
        }

        return builder;
    }
}

function resolveBrowser(option: string | undefined, isFirefox: boolean, originalPath?: string): BrowserEnum {
    const known = Object.values(BrowserEnum).find((value) => value === option?.toLowerCase());

    if (known) {
        return known;
    }

    if (isFirefox) {
        return BrowserEnum.FIREFOX;
    }

    return /chromium/i.test(originalPath ?? '') ? BrowserEnum.CHROMIUM : BrowserEnum.CHROME;
}

export function parseDateOption(value: string | undefined, name: string): number | undefined {
    if (!value) {
        return undefined;
    }

    const dateTime = DateTime.fromISO(value, { zone: 'utc' });

    if (!dateTime.isValid) {
        throw new Error(`Invalid ${name} "${value}", expected an ISO date`);
    }

    return dateTime.toMillis() * 1000;
}
