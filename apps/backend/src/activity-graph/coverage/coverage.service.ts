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

@Injectable()
export class CoverageService {
    constructor(@Inject(NEODE_PROVIDER) private readonly neode: Neode) {}

    public async getCoverage(query: CoverageQuery): Promise<CoverageResponseDto> {
        const params = {
            from: query.from ?? null,
            // Exclusive upper bound so ISO timestamps on the last day still match.
            toExclusive: query.to ? nextDay(query.to) : null,
            nonTypeLabels: NON_TYPE_LABELS,
        };
        const match = `MATCH (a:${NodeLabelEnum.ACTIVITY})
             WHERE a.startTime IS NOT NULL
               AND ($from IS NULL OR a.startTime >= $from)
               AND ($toExclusive IS NULL OR a.startTime < $toExclusive)`;
        const day = 'toString(date(datetime(a.startTime)))';

        const keyed =
            query.groupBy === 'source'
                ? `OPTIONAL MATCH (a)-[:${RelationshipLabelEnum.GENERATED_BY}]->(g:${NodeLabelEnum.EXTENSION})
                   WITH a, coalesce(g.name, 'unknown') AS key`
                : // Importer-specific labels such as GoogleTimelineActivity name the source, not the type.
                  `UNWIND [l IN labels(a) WHERE NOT l IN $nonTypeLabels AND NOT l ENDS WITH 'Activity'] AS key
                   WITH a, key`;

        const [grouped, overall] = await Promise.all([
            this.neode.readCypher<CoverageRow>(
                `${match} ${keyed} RETURN key, ${day} AS day, count(*) AS count`,
                params,
            ),
            this.neode.readCypher<CoverageRow>(
                `${match} RETURN 'all' AS key, ${day} AS day, count(*) AS count`,
                params,
            ),
        ]);

        const toRows = (result: typeof grouped): CoverageRow[] =>
            result.records.map((record) => ({
                key: String(record.get('key')),
                day: String(record.get('day')),
                count: Number(record.get('count')),
            }));

        const series = bucketRows(toRows(grouped));
        const [overallSeries = { key: 'all', label: 'Alle', total: 0, days: {} }] = bucketRows(toRows(overall), {
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
