import { describe, expect, it, vi } from 'vitest';
import { FilterActivitiesPipelineModule } from './filter-activities.pipeline-module.js';
import { SampleActivitiesMode, SampleActivitiesPipelineModule } from './sample-activities.pipeline-module.js';
import { DeduplicateActivitiesPipelineModule } from './deduplicate-activities.pipeline-module.js';
import type { ActivityDto } from '../../../../activity-graph/dto/activity.dto.js';

const progress = { report: vi.fn(), message: vi.fn() };

function context<T>(inputData: T) {
    return { inputData, progress, dryRun: false } as never;
}

function activity(partial: Record<string, unknown>): ActivityDto {
    return { '@type': 'Listen', actor: {}, ...partial } as unknown as ActivityDto;
}

const many = Array.from({ length: 20 }, (_, i) =>
    activity({ startTime: `2024-01-${String(i + 1).padStart(2, '0')}T12:00:00Z`, i }),
);
const indexes = (list: ActivityDto[]) => list.map((a) => (a as unknown as { i: number }).i);

describe('FilterActivitiesPipelineModule', () => {
    const module = new FilterActivitiesPipelineModule();

    it('filters by date range, from inclusive and to exclusive', () => {
        const result = module.executeModule(
            context({ activities: many, dateFrom: '2024-01-05T12:00:00Z', dateTo: '2024-01-08T12:00:00Z' }),
        );

        expect(indexes(result.activities)).toEqual([4, 5, 6]);
        expect(result.removedCount).toBe(17);
    });

    it('drops activities without startTime when a date bound is set, keeps them otherwise', () => {
        const input = [activity({}), activity({ startTime: 'nope' }), activity({ startTime: '2024-02-01' })];

        expect(module.executeModule(context({ activities: input, dateFrom: '2024-01-01' })).activities).toHaveLength(1);
        expect(module.executeModule(context({ activities: input })).activities).toHaveLength(3);
    });

    it('matches @type and @secondaryTypes', () => {
        const input = [
            activity({ '@type': 'Listen' }),
            activity({ '@type': 'Visit', '@secondaryTypes': ['Travel'] }),
            activity({ '@type': 'View' }),
        ];

        expect(module.executeModule(context({ activities: input, types: ['Travel', 'View'] })).activities).toHaveLength(
            2,
        );
        expect(module.executeModule(context({ activities: input, types: [] })).activities).toHaveLength(3);
    });

    it('applies the limit after filtering and rejects invalid dates', () => {
        expect(module.executeModule(context({ activities: many, limit: 3 })).activities).toHaveLength(3);
        expect(() => module.executeModule(context({ activities: many, dateFrom: 'yesterday-ish' }))).toThrow(
            /dateFrom/,
        );
    });

    it('reports progress', () => {
        progress.report.mockClear();
        module.executeModule(context({ activities: many }));
        expect(progress.report).toHaveBeenCalled();
    });
});

describe('SampleActivitiesPipelineModule', () => {
    const module = new SampleActivitiesPipelineModule();

    it('takes the first n', () => {
        expect(indexes(module.executeModule(context({ activities: many, n: 3 })).activities)).toEqual([0, 1, 2]);
    });

    it('takes every nth', () => {
        const result = module.executeModule(context({ activities: many, mode: SampleActivitiesMode.EVERY_NTH, n: 7 }));

        expect(indexes(result.activities)).toEqual([0, 7, 14]);
        expect(result.removedCount).toBe(17);
    });

    it('takes n random ones, reproducibly and in original order', () => {
        const input = { activities: many, mode: SampleActivitiesMode.RANDOM, n: 5, seed: 'abc' };
        const a = indexes(module.executeModule(context(input)).activities);
        const b = indexes(module.executeModule(context(input)).activities);
        const c = indexes(module.executeModule(context({ ...input, seed: 'other' })).activities);

        expect(a).toEqual(b);
        expect(a).toHaveLength(5);
        expect(new Set(a).size).toBe(5);
        expect(a).toEqual([...a].sort((x, y) => x - y));
        expect(c).not.toEqual(a);
    });

    it('returns everything when n exceeds the input and rejects n < 1', () => {
        expect(
            module.executeModule(context({ activities: many, mode: SampleActivitiesMode.RANDOM, n: 50 })).activities,
        ).toHaveLength(20);
        expect(() => module.executeModule(context({ activities: many, n: 0 }))).toThrow();
    });
});

describe('DeduplicateActivitiesPipelineModule', () => {
    const module = new DeduplicateActivitiesPipelineModule();

    it('keeps the first of activities sharing a stable key', () => {
        const input = [
            activity({ i: 0, stableKeys: ['a'] }),
            activity({ i: 1, stableKeys: ['b'] }),
            activity({ i: 2, stableKeys: ['x', 'a'] }),
            activity({ i: 3, stableKeys: ['b'] }),
            activity({ i: 4 }),
            activity({ i: 5 }),
        ];
        const result = module.executeModule(context({ activities: input }));

        expect(indexes(result.activities)).toEqual([0, 1, 4, 5]);
        expect(result.removedCount).toBe(2);
    });
});
