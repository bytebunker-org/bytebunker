import { describe, expect, it, vi } from 'vitest';
import { CoverageService } from './coverage.service.js';

function result(rows: Record<string, unknown>[]) {
    return { records: rows.map((row) => ({ get: (name: string) => row[name] })) };
}

const DEFAULT_FINGERPRINT = { activities: 5, generated: 5 };

/**
 * readCypher mock: the fingerprint query gets `fingerprint`, the grouped query `rows` and the overall query (key
 * 'all') `overall`.
 */
function mockNeode(
    rows: Record<string, unknown>[],
    overall: Record<string, unknown>[] = rows.map((row) => ({ ...row, key: 'all' })),
    fingerprint: Record<string, unknown> = DEFAULT_FINGERPRINT,
) {
    return vi.fn<(cypher: string, params?: Record<string, unknown>) => Promise<ReturnType<typeof result>>>((cypher) =>
        Promise.resolve(
            result(
                cypher.includes('AS activities')
                    ? [fingerprint]
                    : cypher.includes("RETURN 'all' AS key")
                      ? overall
                      : rows,
            ),
        ),
    );
}

const coverageCalls = (readCypher: ReturnType<typeof mockNeode>) =>
    readCypher.mock.calls.filter(([cypher]) => !cypher.includes('AS activities'));

describe('CoverageService', () => {
    it('builds series, overall series and gaps from aggregated rows', async () => {
        const readCypher = mockNeode([
            { key: 'google', day: '2020-01-01', count: 3 },
            { key: 'google', day: '2020-02-01', count: 2 },
        ]);
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
        expect(coverageCalls(readCypher)[0][1]).toMatchObject({ from: '2020-01-01', toExclusive: '2021-01-01' });
    });

    it('returns an empty overall series without data', async () => {
        const readCypher = mockNeode([]);
        const response = await new CoverageService({ readCypher } as never).getCoverage({
            groupBy: 'type',
            minGapDays: 14,
        });

        expect(response.series).toEqual([]);
        expect(response.overall.total).toBe(0);
        expect(response.gaps).toEqual([]);
    });

    it('serves repeated queries from the cache until the graph fingerprint changes', async () => {
        const fingerprint = { activities: 5, generated: 5 };
        const readCypher = mockNeode([{ key: 'google', day: '2020-01-01', count: 1 }], undefined, fingerprint);
        const service = new CoverageService({ readCypher } as never);
        const query = { groupBy: 'source' as const, minGapDays: 14 };

        await service.getCoverage(query);
        await service.getCoverage(query);
        expect(coverageCalls(readCypher)).toHaveLength(2);

        fingerprint.activities = 6;
        await service.getCoverage(query);
        expect(coverageCalls(readCypher)).toHaveLength(4);

        await service.getCoverage({ ...query, minGapDays: 7 });
        expect(coverageCalls(readCypher)).toHaveLength(6);
    });
});
