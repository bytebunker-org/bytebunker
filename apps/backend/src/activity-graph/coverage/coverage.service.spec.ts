import { describe, expect, it, vi } from 'vitest';
import { CoverageService } from './coverage.service.js';

function result(rows: Record<string, unknown>[]) {
    return { records: rows.map((row) => ({ get: (name: string) => row[name] })) };
}

describe('CoverageService', () => {
    it('builds series, overall series and gaps from aggregated rows', async () => {
        const readCypher = vi
            .fn()
            .mockResolvedValueOnce(
                result([
                    { key: 'google', day: '2020-01-01', count: 3 },
                    { key: 'google', day: '2020-02-01', count: 2 },
                ]),
            )
            .mockResolvedValueOnce(
                result([
                    { key: 'all', day: '2020-01-01', count: 3 },
                    { key: 'all', day: '2020-02-01', count: 2 },
                ]),
            );
        const service = new CoverageService({ readCypher } as never);

        const response = await service.getCoverage({
            from: '2020-01-01',
            to: '2020-12-31',
            groupBy: 'source',
            minGapDays: 14,
        });

        expect(response.series[0]).toMatchObject({ key: 'google', total: 5 });
        expect(response.overall).toMatchObject({ key: 'all', total: 5 });
        expect(response.gaps.map((g) => g.key)).toEqual(['all', 'google']);
        expect(readCypher.mock.calls[0][1]).toMatchObject({ from: '2020-01-01', toExclusive: '2021-01-01' });
    });

    it('returns an empty overall series without data', async () => {
        const readCypher = vi.fn().mockResolvedValue(result([]));
        const response = await new CoverageService({ readCypher } as never).getCoverage({
            groupBy: 'type',
            minGapDays: 14,
        });

        expect(response.series).toEqual([]);
        expect(response.overall.total).toBe(0);
        expect(response.gaps).toEqual([]);
    });
});
