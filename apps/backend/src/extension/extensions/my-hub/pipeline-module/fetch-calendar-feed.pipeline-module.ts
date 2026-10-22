import { Optional, Required, Type } from 'ts-decorator-json-schema-generator';
import { Logger } from '@nestjs/common';
import { DateTime } from 'luxon';
import { AssetDto } from '../../../../etl/asset/dto/asset.dto.js';
import { AssetService } from '../../../../etl/asset/asset.service.js';
import { AssetTypeEnum } from '../../../../etl/asset/type/asset-type.enum.js';
import { PipelineModule } from '../../../../etl/pipeline/pipeline-module/decorator/pipeline-module.decorator.js';
import { PipelineModuleJsonSchema } from '../../../../etl/pipeline/pipeline-module/decorator/pipeline-module-json-schema.decorator.js';
import type {
    IPipelineModule,
    PipelineModuleExecutionContext,
} from '../../../../etl/pipeline/pipeline-module/type/pipeline-module.interface.js';
import { MY_HUB_EXTENSION } from '../../local-extension.constant.js';
import { MyHubClientService } from '../my-hub-client.service.js';

@PipelineModuleJsonSchema()
export class FetchCalendarFeedInput {
    /**
     * Slug of a my-hub store calendar, exported via `GET /export/calendars/<slug>/ics` with original UIDs (preferred:
     * these dedupe with older .ics exports of the same calendar). `GET /export/calendars` lists the slugs.
     */
    @Optional()
    @Type('string')
    public calendarSlug?: string;

    /**
     * Any iCalendar feed URL instead, e.g. a my-hub webcal URL. Note: my-hub webcal feeds use the hub's own ids as
     * UID (`caldav:<calendar>:<uid>`), which do not dedupe with exports from the original provider.
     */
    @Optional()
    @Type('string')
    public feedUrl?: string;
}

@PipelineModuleJsonSchema()
export class FetchCalendarFeedOutput {
    @Required()
    @Type(AssetDto)
    public icsFile!: AssetDto;
}

/**
 * Downloads a calendar from my-hub (the source of current events) and stores it as an asset for
 * `ics-calendar:parse-ics-file`. The asset is content-addressed, so an unchanged calendar is stored once.
 */
@PipelineModule({
    extensionName: MY_HUB_EXTENSION,
    inputType: FetchCalendarFeedInput,
    outputType: FetchCalendarFeedOutput,
})
export class FetchCalendarFeedPipelineModule
    implements IPipelineModule<FetchCalendarFeedInput, FetchCalendarFeedOutput>
{
    private readonly logger = new Logger(FetchCalendarFeedPipelineModule.name);

    constructor(
        private readonly myHubClient: MyHubClientService,
        private readonly assetService: AssetService,
    ) {}

    public async executeModule({
        em,
        inputData,
        progress,
    }: PipelineModuleExecutionContext<FetchCalendarFeedInput>): Promise<FetchCalendarFeedOutput> {
        const { calendarSlug, feedUrl } = inputData;

        if (Boolean(calendarSlug) === Boolean(feedUrl)) {
            throw new Error('Set exactly one of calendarSlug or feedUrl');
        }

        progress.message(calendarSlug ? `Downloading calendar ${calendarSlug}` : 'Downloading calendar feed');
        const ics = calendarSlug
            ? await this.myHubClient.fetchCalendarIcs(calendarSlug)
            : await this.myHubClient.fetchFeed(feedUrl!);

        if (!/^\uFEFF?\s*begin:vcalendar/i.test(ics)) {
            throw new Error('The downloaded calendar is not an iCalendar document');
        }

        const name = calendarSlug ?? safeFeedName(feedUrl!);
        const icsFile = await this.assetService.storeAsset(em, ics, {
            type: AssetTypeEnum.PIPELINE,
            // Date in the name keeps snapshots apart in the asset list; dedup is by content hash anyway.
            originalFilePath: `my-hub/calendar/${name}-${DateTime.utc().toFormat('yyyyLLdd')}.ics`,
            metadata: { 'Content-Type': 'text/calendar' },
        });

        this.logger.log(`Stored my-hub calendar ${name} (${ics.length} characters) as asset ${icsFile.id}`);

        return { icsFile };
    }
}

/** File name part for a feed URL, without its query (webcal URLs carry their token there). */
function safeFeedName(feedUrl: string): string {
    const path = feedUrl.replace(/[#?].*$/, '').replace(/\/+$/, '');
    const last = path.slice(path.lastIndexOf('/') + 1).replace(/\.ics$/i, '');

    return last.replaceAll(/[^\w.-]+/g, '-') || 'feed';
}
