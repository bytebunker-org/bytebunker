import { beforeAll, describe, expect, it } from 'vitest';
import type { EntityManager } from '@mikro-orm/postgresql';
import { TransformTimelinePipelineModule } from './transform-timeline.pipeline-module.js';
import { ActivityStableKeyService } from '../../../../activity-graph/activity-stable-key.service.js';
import { NOOP_MODULE_PROGRESS_REPORTER } from '../../../../etl/pipeline/progress/type/module-progress-reporter.interface.js';
import { setGlobalSettings } from '../../../../shared/setting/global-setting.constant.js';

const visit = (placeId: string, latLng: string, hierarchyLevel: number, end = '2024-05-01T12:00:00.000+02:00') => ({
    startTime: '2024-05-01T10:00:00.000+02:00',
    endTime: end,
    visit: {
        hierarchyLevel,
        probability: 0.9,
        topCandidate: {
            placeId,
            semanticType: hierarchyLevel ? 'UNKNOWN' : 'WORK',
            probability: 0.8,
            placeLocation: { latLng },
        },
    },
});

const TIMELINE = {
    semanticSegments: [
        visit('place-mall', '10.0000000°, 20.0000000°', 0),
        visit('place-shop', '10.0001000°, 20.0001000°', 1, '2024-05-01T10:30:00.000+02:00'),
        // Exported twice.
        visit('place-shop', '10.0001000°, 20.0001000°', 1, '2024-05-01T10:30:00.000+02:00'),
        {
            startTime: '2024-05-01T12:00:00.000+02:00',
            endTime: '2024-05-01T12:20:00.000+02:00',
            activity: {
                start: { latLng: '10.0000000°, 20.0000000°' },
                end: { latLng: '11.0000000°, 21.0000000°' },
                topCandidate: { type: 'WALKING' },
            },
        },
    ],
};

type Activity = Record<string, unknown> & { stableKeys: string[] };

describe('TransformTimelinePipelineModule', () => {
    const module = new TransformTimelinePipelineModule(
        { getAssetString: () => Promise.resolve(JSON.stringify(TIMELINE)) } as never,
        new ActivityStableKeyService(undefined as never, undefined as never),
        { getOwnerActor: () => Promise.resolve({ get: () => 'actor' }) } as never,
        { getExtension: () => Promise.resolve({ '@id': 'extension/google', '@type': 'Application' }) } as never,
    );
    let activities: Activity[];

    beforeAll(async () => {
        setGlobalSettings({
            eventUniqueLocationPrecisionSetting: 5,
            eventUniqueDateTimePrecisionSetting: 'second',
        } as Parameters<typeof setGlobalSettings>[0]);

        ({ activities } = (await module.executeModule({
            em: {} as EntityManager,
            inputData: { rawJson: { originalFilename: 'Timeline.json' } as never },
            progress: NOOP_MODULE_PROGRESS_REPORTER,
            dryRun: false,
        } as never)) as unknown as { activities: Activity[] });
    });

    it('collapses identical segments and keeps nested visits apart from their parent', () => {
        expect(activities.map((a) => a['@type'])).toEqual(['Arrive', 'Arrive', 'Move']);
        expect(new Set(activities.map((a) => a.stableKeys[0])).size).toBe(3);
    });

    it('keeps semanticType and hierarchyLevel on the Arrive activity', () => {
        expect(activities[0]).toMatchObject({ hierarchyLevel: 0, semanticType: 'WORK' });
        expect(activities[1]).toMatchObject({ hierarchyLevel: 1, semanticType: 'UNKNOWN' });
    });

    it('identifies named places by placeId only and anonymous points by coordinates', () => {
        const location = activities[0]!['location'] as { stableKeys: string[] };
        const origin = activities[2]!['origin'] as { stableKeys: string[] };

        expect(location.stableKeys).toEqual(['["Place",{"placeId":"place-mall"}]']);
        expect(origin.stableKeys).toEqual(['["Place",{"lat":"10.00000","lng":"20.00000"}]']);
    });
});
