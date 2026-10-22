import { describe, expect, it } from 'vitest';
import { bucketRows, computeGaps } from './coverage.util.js';

describe('coverage util', () => {
    it('buckets rows per key and merges duplicate days', () => {
        const series = bucketRows([
            { key: 'a', day: '2020-01-02', count: 1 },
            { key: 'a', day: '2020-01-02', count: 2 },
            { key: 'a', day: '2020-01-01', count: 4 },
            { key: 'b', day: '2020-03-01', count: 1 },
            { key: 'b', day: '2020-03-02', count: 0 },
        ]);

        expect(series.map((s) => s.key)).toEqual(['a', 'b']);
        expect(series[0]).toMatchObject({
            total: 7,
            firstDay: '2020-01-01',
            lastDay: '2020-01-02',
            days: { '2020-01-01': 4, '2020-01-02': 3 },
        });
        expect(series[1].days).toEqual({ '2020-03-01': 1 });
    });

    it('finds gaps of at least the threshold between first and last day', () => {
        const [series] = bucketRows([
            { key: 'a', day: '2020-03-01', count: 1 },
            { key: 'a', day: '2020-03-02', count: 1 },
            { key: 'a', day: '2020-03-16', count: 1 }, // 13 empty days: below threshold
            { key: 'a', day: '2020-06-15', count: 1 }, // 2020-03-17..2020-06-14 = 90 days
        ]);

        expect(computeGaps(series, 14)).toEqual([{ key: 'a', from: '2020-03-17', to: '2020-06-14', days: 90 }]);
        expect(computeGaps(series, 13)).toHaveLength(2);
    });

    it('counts gaps across a leap day and has none for a single day', () => {
        const [series] = bucketRows([
            { key: 'a', day: '2020-02-01', count: 1 },
            { key: 'a', day: '2020-03-01', count: 1 },
        ]);
        expect(computeGaps(series, 14)[0]).toMatchObject({ from: '2020-02-02', to: '2020-02-29', days: 28 });

        const [single] = bucketRows([{ key: 'a', day: '2020-02-01', count: 1 }]);
        expect(computeGaps(single, 1)).toEqual([]);
    });
});
