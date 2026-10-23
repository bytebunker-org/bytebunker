import { Inject, Injectable } from '@nestjs/common';
import { Neode } from '@bytebunker/neode';
import { NEODE_PROVIDER } from '../graph-database/neode.constant.js';
import { NodeLabelEnum } from '../node-label.enum.js';
import { RelationshipLabelEnum } from '../relationship-label.enum.js';
import type { CoverageGroupBy, CoverageResponseDto } from './dto/coverage.dto.js';
import { bucketRows, computeGaps, nextDay, type CoverageRow } from './coverage.util.js';

export interface CoverageQuery {
    from?: string;
    to?: string;
    groupBy: CoverageGroupBy;
    minGapDays: number;
}

/** Labels every activity has; they say nothing about its type. */
const NON_TYPE_LABELS = [NodeLabelEnum.AS_OBJECT, NodeLabelEnum.ACTIVITY];

/** Safety net for changes the fingerprint misses (e.g. an edited startTime). */
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX_ENTRIES = 20;

interface CacheEntry {
    fingerprint: string;
    createdAt: number;
    value: Promise<CoverageResponseDto>;
}

@Injectable()
export class CoverageService {
    private readonly cache = new Map<string, CacheEntry>();

    constructor(@Inject(NEODE_PROVIDER) private readonly neode: Neode) {}

    /**
     * Cached per query. The cache is keyed by a fingerprint of the graph (activity and GENERATED_BY counts, both
     * read from Neo4j's count store), so imports and deletions in any process invalidate it without hooks.
     */
    public async getCoverage(query: CoverageQuery): Promise<CoverageResponseDto> {
        const key = JSON.stringify([query.from, query.to, query.groupBy, query.minGapDays]);
        const fingerprint = await this.fingerprint();
        const cached = this.cache.get(key);

        if (cached && cached.fingerprint === fingerprint && Date.now() - cached.createdAt < CACHE_TTL_MS) {
            return cached.value;
        }

        const value = this.computeCoverage(query);
        this.cache.delete(key);
        this.cache.set(key, { fingerprint, createdAt: Date.now(), value });
        // Failed computations must not stick.
        value.catch(() => this.cache.get(key)?.value === value && this.cache.delete(key));

        while (this.cache.size > CACHE_MAX_ENTRIES) {
            this.cache.delete(this.cache.keys().next().value!);
        }

        return value;
    }

    private async fingerprint(): Promise<string> {
        const result = await this.neode.readCypher(
            `CALL { MATCH (a:${NodeLabelEnum.ACTIVITY}) RETURN count(a) AS activities }
             CALL { MATCH ()-[r:${RelationshipLabelEnum.GENERATED_BY}]->() RETURN count(r) AS generated }
             RETURN activities, generated`,
            {},
        );
        const record = result.records[0];

        return record ? `${Number(record.get('activities'))}:${Number(record.get('generated'))}` : '';
    }

    private async computeCoverage(query: CoverageQuery): Promise<CoverageResponseDto> {
        const params = {
            from: query.from ?? null,
            // Exclusive upper bound so ISO timestamps on the last day still match.
            toExclusive: query.to ? nextDay(query.to) : null,
            nonTypeLabels: NON_TYPE_LABELS,
        };
        // startTime is an ISO string; its first ten characters are the day. Same result as
        // date(datetime(a.startTime)) at a fraction of the cost (no parsing per activity).
        const match = `MATCH (a:${NodeLabelEnum.ACTIVITY})
             WHERE a.startTime IS NOT NULL
               AND ($from IS NULL OR a.startTime >= $from)
               AND ($toExclusive IS NULL OR a.startTime < $toExclusive)`;
        const day = 'substring(a.startTime, 0, 10)';

        const keyed =
            query.groupBy === 'source'
                ? `OPTIONAL MATCH (a)-[:${RelationshipLabelEnum.GENERATED_BY}]->(g:${NodeLabelEnum.EXTENSION})
                   WITH a, coalesce(g.name, 'unknown') AS key`
                : // Importer-specific labels such as GoogleTimelineActivity name the source, not the type.
                  `UNWIND [l IN labels(a) WHERE NOT l IN $nonTypeLabels AND NOT l ENDS WITH 'Activity'] AS key
                   WITH a, key`;

        const [groupedResult, overallResult] = await Promise.all([
            this.neode.readCypher(`${match} ${keyed} RETURN key, ${day} AS day, count(*) AS count`, params),
            this.neode.readCypher(`${match} RETURN 'all' AS key, ${day} AS day, count(*) AS count`, params),
        ]);

        const toRows = (result: typeof groupedResult): CoverageRow[] =>
            result.records.map((record) => ({
                key: String(record.get('key')),
                day: String(record.get('day')),
                count: Number(record.get('count')),
            }));
        const grouped = toRows(groupedResult);
        const overall = toRows(overallResult);

        const series = bucketRows(grouped);
        const [overallSeries = { key: 'all', label: 'Alle', total: 0, days: {} }] = bucketRows(overall, {
            all: 'Alle',
        });

        return {
            from: query.from,
            to: query.to,
            groupBy: query.groupBy,
            minGapDays: query.minGapDays,
            overall: overallSeries,
            series,
            gaps: [overallSeries, ...series].flatMap((s) => computeGaps(s, query.minGapDays)),
        };
    }
}
