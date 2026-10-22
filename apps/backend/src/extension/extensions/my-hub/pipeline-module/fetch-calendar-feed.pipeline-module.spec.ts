import { beforeEach, describe, expect, it } from 'vitest';
import { TestBed } from '@suites/unit';
import type { Mocked } from '@suites/doubles.vitest';
import type { EntityManager } from '@mikro-orm/postgresql';
import { FetchCalendarFeedPipelineModule, type FetchCalendarFeedInput } from './fetch-calendar-feed.pipeline-module.js';
import { MyHubClientService } from '../my-hub-client.service.js';
import { AssetService } from '../../../../etl/asset/asset.service.js';
import { AssetTypeEnum } from '../../../../etl/asset/type/asset-type.enum.js';
import type { AssetDto } from '../../../../etl/asset/dto/asset.dto.js';
import { NOOP_MODULE_PROGRESS_REPORTER } from '../../../../etl/pipeline/progress/type/module-progress-reporter.interface.js';
import type { PipelineModuleExecutionContext } from '../../../../etl/pipeline/pipeline-module/type/pipeline-module.interface.js';
import { MY_HUB_CALENDAR_ICS } from '../my-hub.fixture.js';

const EM = {} as EntityManager;
const ASSET = { id: '00000000-0000-0000-0000-0000000000cc' } as AssetDto;

function context(inputData: FetchCalendarFeedInput): PipelineModuleExecutionContext<FetchCalendarFeedInput> {
    return {
        em: EM,
        inputData,
        progress: NOOP_MODULE_PROGRESS_REPORTER,
    } as unknown as PipelineModuleExecutionContext<FetchCalendarFeedInput>;
}

describe('FetchCalendarFeedPipelineModule', () => {
    let module: FetchCalendarFeedPipelineModule;
    let client: Mocked<MyHubClientService>;
    let assetService: Mocked<AssetService>;

    beforeEach(async () => {
        const { unit, unitRef } = await TestBed.solitary(FetchCalendarFeedPipelineModule).compile();

        module = unit;
        client = unitRef.get(MyHubClientService) as unknown as Mocked<MyHubClientService>;
        assetService = unitRef.get(AssetService) as unknown as Mocked<AssetService>;
        void assetService.storeAsset.mockResolvedValue(ASSET);
    });

    it('stores a store calendar export as an ICS asset for parse-ics-file', async () => {
        void client.fetchCalendarIcs.mockResolvedValue(MY_HUB_CALENDAR_ICS);

        const result = await module.executeModule(context({ calendarSlug: 'personal' }));

        expect(result).toEqual({ icsFile: ASSET });
        expect(client.fetchCalendarIcs).toHaveBeenCalledWith('personal');
        expect(assetService.storeAsset).toHaveBeenCalledWith(
            EM,
            MY_HUB_CALENDAR_ICS,
            expect.objectContaining({
                type: AssetTypeEnum.PIPELINE,
                originalFilePath: expect.stringMatching(/^my-hub\/calendar\/personal-\d{8}\.ics$/),
                metadata: { 'Content-Type': 'text/calendar' },
            }),
        );
    });

    it('downloads a feed URL and keeps its token out of the asset name', async () => {
        void client.fetchFeed.mockResolvedValue(MY_HUB_CALENDAR_ICS);

        await module.executeModule(context({ feedUrl: 'webcal://hub.example.test/webcal/family?token=secret' }));

        expect(client.fetchFeed).toHaveBeenCalledWith('webcal://hub.example.test/webcal/family?token=secret');
        const options = assetService.storeAsset.mock.calls[0]![2];
        expect(options.originalFilePath).toMatch(/^my-hub\/calendar\/family-\d{8}\.ics$/);
    });

    it('needs exactly one source', async () => {
        await expect(module.executeModule(context({}))).rejects.toThrow(/exactly one/);
        await expect(
            module.executeModule(context({ calendarSlug: 'a', feedUrl: 'https://hub.example.test/a.ics' })),
        ).rejects.toThrow(/exactly one/);
    });

    it('rejects responses that are not iCalendar', async () => {
        void client.fetchCalendarIcs.mockResolvedValue('<html>login</html>');

        await expect(module.executeModule(context({ calendarSlug: 'personal' }))).rejects.toThrow(/not an iCalendar/);
        expect(assetService.storeAsset).not.toHaveBeenCalled();
    });
});
