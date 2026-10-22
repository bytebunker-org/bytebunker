import { beforeEach, describe, expect, it } from 'vitest';
import { TestBed } from '@suites/unit';
import type { Mocked } from '@suites/doubles.vitest';
import { SyncPersonsPipelineModule } from './sync-persons.pipeline-module.js';
import { MyHubClientService } from '../my-hub-client.service.js';
import { NOOP_MODULE_PROGRESS_REPORTER } from '../../../../etl/pipeline/progress/type/module-progress-reporter.interface.js';
import type { PipelineModuleExecutionContext } from '../../../../etl/pipeline/pipeline-module/type/pipeline-module.interface.js';
import type { SyncPersonsInput } from './sync-persons.pipeline-module.js';
import { createMyHubPerson } from '../my-hub.fixture.js';

function context(inputData: SyncPersonsInput): PipelineModuleExecutionContext<SyncPersonsInput> {
    return {
        inputData,
        progress: NOOP_MODULE_PROGRESS_REPORTER,
    } as unknown as PipelineModuleExecutionContext<SyncPersonsInput>;
}

describe('SyncPersonsPipelineModule', () => {
    let module: SyncPersonsPipelineModule;
    let client: Mocked<MyHubClientService>;

    beforeEach(async () => {
        const { unit, unitRef } = await TestBed.solitary(SyncPersonsPipelineModule).compile();

        module = unit;
        client = unitRef.get(MyHubClientService) as unknown as Mocked<MyHubClientService>;
        void client.fetchPersons.mockResolvedValue([
            createMyHubPerson({ id: 1 }),
            createMyHubPerson({ id: 2, isPlaceholder: true, displayName: 'Annas Mutter', emails: [] }),
            createMyHubPerson({ id: 3, isHidden: true }),
        ]);
    });

    it('maps persons to Person + MyHubPerson objects, skipping placeholders', async () => {
        const { objects } = await module.executeModule(context({}));

        expect(client.fetchPersons).toHaveBeenCalledWith({ updatedSince: undefined, includePlaceholders: undefined });
        expect(objects.map((object) => (object as unknown as { myHubId: number }).myHubId)).toEqual([1, 3]);
        expect(objects[0]).toMatchObject({ '@type': 'Person', '@secondaryTypes': ['MyHubPerson'] });
        expect(objects[0]!.stableKeys).toContain('person:myhub:1');
        expect(objects[0]!.stableKeys).toContain('person:handle:whatsapp-name:erika m');
    });

    it('includes placeholders and drops hidden persons on request', async () => {
        const { objects } = await module.executeModule(
            context({ includePlaceholders: true, includeHidden: false, updatedSince: '2026-10-01T00:00:00Z' }),
        );

        expect(client.fetchPersons).toHaveBeenCalledWith({
            updatedSince: '2026-10-01T00:00:00Z',
            includePlaceholders: true,
        });
        expect(objects.map((object) => (object as unknown as { myHubId: number }).myHubId)).toEqual([1, 2]);
    });

    it('uses the configured default country code for local numbers', async () => {
        void client.fetchPersons.mockResolvedValue([
            createMyHubPerson({
                emails: [],
                impps: [],
                handles: [],
                phones: [{ value: '0661 123456', normalizedValue: null }],
            }),
        ]);

        const { objects } = await module.executeModule(context({ defaultCountryCode: '43' }));

        expect(objects[0]!.stableKeys).toEqual(['person:myhub:101', 'person:phone:+43661123456']);
    });
});
