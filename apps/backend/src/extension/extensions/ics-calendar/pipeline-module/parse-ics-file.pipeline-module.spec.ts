import { beforeEach, describe, expect, it } from 'vitest';
import { TestBed } from '@suites/unit';
import type { Mocked } from '@suites/doubles.vitest';
import type { EntityManager } from '@mikro-orm/postgresql';
import type { ASObject, EventActivity, Place } from '@bytebunker/event-schema';
import { ParseIcsFilePipelineModule } from './parse-ics-file.pipeline-module.js';
import { AssetService } from '../../../../etl/asset/asset.service.js';
import { ActivityStableKeyService } from '../../../../activity-graph/activity-stable-key.service.js';
import { ActivityGraphService } from '../../../../activity-graph/activity-graph.service.js';
import { ActivityGraphNodeService } from '../../../../activity-graph/activity-graph-node.service.js';
import {
    ICS_WITH_INVALID_VEVENT,
    ICS_WITH_LOCATION_AND_ATTENDEES,
    MINIMAL_ICS,
} from './parse-ics-file.fixture.js';

const FAKE_ACTOR_ID = '00000000-0000-0000-0000-0000000000aa';
const FAKE_GENERATOR: ASObject = {
    '@id': '00000000-0000-0000-0000-0000000000bb',
    '@type': 'Application',
    name: 'ics-calendar',
};

describe('ParseIcsFilePipelineModule', () => {
    let module: ParseIcsFilePipelineModule;
    let assetService: Mocked<AssetService>;
    let stableKeyService: Mocked<ActivityStableKeyService>;
    let graphService: Mocked<ActivityGraphService>;
    let graphNodeService: Mocked<ActivityGraphNodeService>;

    beforeEach(async () => {
        const { unit, unitRef } = await TestBed.solitary(ParseIcsFilePipelineModule).compile();

        module = unit;
        assetService = unitRef.get(AssetService) as unknown as Mocked<AssetService>;
        stableKeyService = unitRef.get(ActivityStableKeyService) as unknown as Mocked<ActivityStableKeyService>;
        graphService = unitRef.get(ActivityGraphService) as unknown as Mocked<ActivityGraphService>;
        graphNodeService = unitRef.get(ActivityGraphNodeService) as unknown as Mocked<ActivityGraphNodeService>;

        graphNodeService.getExtension.mockResolvedValue(FAKE_GENERATOR);
        graphService.getOwnerActor.mockResolvedValue({
            get: (key: string) => (key === 'id' ? FAKE_ACTOR_ID : undefined),
        } as never);
        stableKeyService.createActivityStableKey.mockReturnValue('activity-stable-key');
        stableKeyService.createASObjectStableKey.mockReturnValue('object-stable-key');
    });

    describe('parseIcsToActivities', () => {
        it('produces a single Event activity for a minimal VEVENT', () => {
            const activities = module.parseIcsToActivities(MINIMAL_ICS, FAKE_GENERATOR, FAKE_ACTOR_ID);

            expect(activities).toHaveLength(1);
            const event = activities[0] as unknown as EventActivity;
            expect(event['@type']).toBe('Event');
            expect(event.summary).toBe('Hair Appointment');
            expect(event.actor).toEqual({ '@id': FAKE_ACTOR_ID, '@type': 'Person' });
            expect(event.generator).toBe(FAKE_GENERATOR);
            expect(event.attendees).toBeUndefined();
            expect(event.location).toBeUndefined();
        });

        it('builds a Place from LOCATION text and emits attendees', () => {
            const activities = module.parseIcsToActivities(
                ICS_WITH_LOCATION_AND_ATTENDEES,
                FAKE_GENERATOR,
                FAKE_ACTOR_ID,
            );

            const event = activities[0] as unknown as EventActivity & { location: Place };

            expect(event.summary).toBe('Weekly Standup');
            expect(event.location).toMatchObject({
                '@type': 'Place',
                name: 'Conference Room A',
                stableKeys: ['object-stable-key'],
            });
            expect(event.attendees).toEqual([
                { email: 'alice@example.com', name: 'Alice Johnson', status: 'ACCEPTED' },
                { email: 'bob@example.com', name: 'Bob Smith', status: 'NEEDS-ACTION' },
                { email: 'carol@example.com', status: 'DECLINED' },
            ]);
        });

        it('uses ics:<UID> as the first stable key for UID-based dedup', () => {
            const activities = module.parseIcsToActivities(MINIMAL_ICS, FAKE_GENERATOR, FAKE_ACTOR_ID);

            const event = activities[0] as unknown as EventActivity;

            expect(event.stableKeys).toEqual(['ics:minimal-event-1@test', 'activity-stable-key']);
        });

        it('skips VEVENTs without a SUMMARY but keeps the valid ones', () => {
            const activities = module.parseIcsToActivities(ICS_WITH_INVALID_VEVENT, FAKE_GENERATOR, FAKE_ACTOR_ID);

            expect(activities).toHaveLength(1);
            expect((activities[0] as unknown as EventActivity).summary).toBe('Valid Event');
        });
    });

    describe('executeModule', () => {
        it('reads the asset, parses the ICS, and returns activities', async () => {
            const em = {} as EntityManager;
            const icsFile = { id: 'asset-1' } as never;

            assetService.getAssetString.mockResolvedValue(MINIMAL_ICS);

            const { activities } = await module.executeModule({
                em,
                inputData: { icsFile },
            } as never);

            expect(assetService.getAssetString).toHaveBeenCalledWith(em, icsFile);
            expect(graphNodeService.getExtension).toHaveBeenCalledTimes(1);
            expect(graphService.getOwnerActor).toHaveBeenCalledWith(em);
            expect(activities).toHaveLength(1);
            expect((activities[0] as unknown as EventActivity).summary).toBe('Hair Appointment');
        });
    });
});
