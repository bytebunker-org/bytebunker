import { Optional, Required, Type } from 'ts-decorator-json-schema-generator';
import { PipelineModule } from '../../../../etl/pipeline/pipeline-module/decorator/pipeline-module.decorator.js';
import { PipelineModuleJsonSchema } from '../../../../etl/pipeline/pipeline-module/decorator/pipeline-module-json-schema.decorator.js';
import type {
    IPipelineModule,
    PipelineModuleExecutionContext,
} from '../../../../etl/pipeline/pipeline-module/type/pipeline-module.interface.js';
import { NodeLabelEnum } from '../../../../activity-graph/node-label.enum.js';
import { RelationshipLabelEnum } from '../../../../activity-graph/relationship-label.enum.js';
import { ENRICHMENT_EXTENSION } from '../../local-extension.constant.js';
import { ActivityInputReaderService } from '../graph/activity-input-reader.service.js';
import { DerivedGraphService } from '../graph/derived-graph.service.js';
import { buildDerivedProvenance, type DerivedRelationshipRow } from '../graph/derived-graph.util.js';
import { DailySummaryAccumulator, type DailySummaryRow } from '../util/daily-summary.util.js';
import { formatCount, round, timezoneOr } from '../util/module-input.util.js';

const REPORTED_DAYS = 10;

@PipelineModuleJsonSchema()
export class DailySummaryInput {
    /** IANA timezone that defines the local day. Default Europe/Berlin. */
    @Optional()
    @Type('string')
    public timezone?: string;

    /** Also write SUMMARIZES edges to the day's arrives, moves and events (not listens/views). Default false. */
    @Optional()
    @Type('boolean')
    public linkActivities?: boolean;
}

export interface DailySummaryYear {
    year: string;
    days: number;
    tripDays: number;
    moveDistanceKm: number;
    listeningHours: number;
    events: number;
}

export interface DailySummarySummary {
    dryRun: boolean;
    timezone: string;
    linkActivities: boolean;
    dayCount: number;
    firstDate?: string;
    lastDate?: string;
    perYear: DailySummaryYear[];
    busiestDays: { date: string; activityCount: number }[];
    longestDistanceDays: { date: string; moveDistanceKm: number; modes: string[] }[];
    summarizesEdges: number;
    replacedNodes: number;
    replacedEdges: number;
}

@PipelineModuleJsonSchema()
export class DailySummaryOutput {
    @Required()
    @Type('integer')
    public dayCount!: number;

    /** Days per year, busiest days, longest-distance days. */
    @Required()
    @Type('object')
    public summary!: DailySummarySummary;
}

/**
 * Writes one `DailySummary` node per local day with activity counts, distinct places visited, distance per transport
 * mode, listening minutes and events. Nodes are keyed by date, so a re-run updates them in place; days that no longer
 * have activities are removed. Run after derive-trips to mark trip days.
 */
@PipelineModule({
    extensionName: ENRICHMENT_EXTENSION,
    inputType: DailySummaryInput,
    outputType: DailySummaryOutput,
    progressWeight: 2,
    description:
        'Writes one DailySummary node per local day (timezone input): counts per activity type, distinct places, ' +
        'distance per move type, listening minutes, events, trip days. Keyed by date; replaces its previous output.',
})
export class DailySummaryPipelineModule implements IPipelineModule<DailySummaryInput, DailySummaryOutput> {
    constructor(
        private readonly reader: ActivityInputReaderService,
        private readonly derivedGraphService: DerivedGraphService,
    ) {}

    public async executeModule({
        inputData,
        pipelineExecution,
        currentNode,
        progress,
        dryRun,
    }: PipelineModuleExecutionContext<DailySummaryInput>): Promise<DailySummaryOutput> {
        const timezone = timezoneOr(inputData.timezone);
        const linkActivities = inputData.linkActivities ?? false;
        const provenance = buildDerivedProvenance(currentNode.moduleId, pipelineExecution.id);
        const accumulator = new DailySummaryAccumulator(timezone, { collectActivityIds: linkActivities });
        let read = 0;
        const reportRead = (offset: number) => (count: number) => progress.report({ current: offset + count });

        progress.report({ message: 'Reading arrives', current: 0, unit: 'activities' });
        for (const arrive of await this.reader.readArrives(reportRead(read))) {
            accumulator.addArrive({
                id: arrive.id,
                start: arrive.start,
                end: arrive.end,
                ...(arrive.placeId ? { placeId: arrive.placeId } : {}),
                topLevel: arrive.hierarchyLevel === 0,
            });
            read++;
        }

        progress.message('Reading moves');
        for (const move of await this.reader.readMoves(reportRead(read))) {
            accumulator.addMove(move);
            read++;
        }

        progress.message('Reading listens and views');
        for (const play of await this.reader.readPlays(['listen', 'view'], reportRead(read))) {
            if (play.kind === 'listen') {
                accumulator.addListen(play);
            } else {
                accumulator.addView(play);
            }

            read++;
        }

        progress.message('Reading calendar events and trips');
        for (const event of await this.reader.readEvents()) {
            accumulator.addEvent(event);
        }

        for (const travel of await this.reader.readTravels()) {
            accumulator.addTravel(travel);
        }

        const days = accumulator.build();
        const nodes = days.map((day) => ({ id: day.id, props: toNodeProps(day) }));
        const edges: DerivedRelationshipRow[] = linkActivities
            ? days.flatMap((day) =>
                  day.activityIds.map((activityId) => ({ fromId: day.id, toId: activityId, props: {} })),
              )
            : [];
        const total = nodes.length + edges.length;

        if (!dryRun) {
            progress.report({ current: 0, total, unit: 'nodes and edges', message: 'Writing daily summaries' });
        }

        const replacement = await this.derivedGraphService.replaceDerived(
            provenance,
            { nodeLabels: [NodeLabelEnum.DAILY_SUMMARY], relationshipTypes: [RelationshipLabelEnum.SUMMARIZES] },
            {
                dryRun,
                write: async () => {
                    await this.derivedGraphService.writeNodes(
                        NodeLabelEnum.DAILY_SUMMARY,
                        nodes,
                        provenance,
                        (written) => progress.report({ current: written, total }),
                    );
                    await this.derivedGraphService.writeRelationships(
                        RelationshipLabelEnum.SUMMARIZES,
                        edges,
                        provenance,
                        (written) => progress.report({ current: nodes.length + written, total }),
                    );
                },
            },
        );

        progress.message(`${dryRun ? 'Would summarise' : 'Summarised'} ${formatCount(days.length)} day(s)`);

        return {
            dayCount: days.length,
            summary: {
                dryRun,
                timezone,
                linkActivities,
                dayCount: days.length,
                ...(days[0] ? { firstDate: days[0].date, lastDate: days.at(-1)!.date } : {}),
                perYear: summarisePerYear(days),
                busiestDays: [...days]
                    .sort((a, b) => b.activityCount - a.activityCount)
                    .slice(0, REPORTED_DAYS)
                    .map((day) => ({ date: day.date, activityCount: day.activityCount })),
                longestDistanceDays: [...days]
                    .sort((a, b) => b.moveDistanceKm - a.moveDistanceKm)
                    .slice(0, REPORTED_DAYS)
                    .map((day) => ({ date: day.date, moveDistanceKm: day.moveDistanceKm, modes: day.moveModes })),
                summarizesEdges: edges.length,
                replacedNodes: replacement.replacedNodes,
                replacedEdges: replacement.replacedRelationships,
            },
        };
    }
}

function toNodeProps(day: DailySummaryRow): Record<string, unknown> {
    const { id: _id, activityIds: _activityIds, ...props } = day;

    return { ...props, name: `Day ${day.date}` };
}

export function summarisePerYear(days: DailySummaryRow[]): DailySummaryYear[] {
    const years = new Map<string, DailySummaryYear>();

    for (const day of days) {
        const year = day.date.slice(0, 4);
        const entry = years.get(year) ?? {
            year,
            days: 0,
            tripDays: 0,
            moveDistanceKm: 0,
            listeningHours: 0,
            events: 0,
        };

        entry.days++;
        entry.tripDays += day.onTrip ? 1 : 0;
        entry.moveDistanceKm += day.moveDistanceKm;
        entry.listeningHours += day.listeningMinutes / 60;
        entry.events += day.eventCount;
        years.set(year, entry);
    }

    return [...years.values()]
        .sort((a, b) => a.year.localeCompare(b.year))
        .map((entry) => ({
            ...entry,
            moveDistanceKm: Math.round(entry.moveDistanceKm),
            listeningHours: round(entry.listeningHours),
        }));
}
