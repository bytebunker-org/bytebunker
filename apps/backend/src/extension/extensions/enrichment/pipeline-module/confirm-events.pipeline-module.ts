import { Optional, Required, Type } from 'ts-decorator-json-schema-generator';
import { PipelineModule } from '../../../../etl/pipeline/pipeline-module/decorator/pipeline-module.decorator.js';
import { PipelineModuleJsonSchema } from '../../../../etl/pipeline/pipeline-module/decorator/pipeline-module-json-schema.decorator.js';
import type {
    IPipelineModule,
    PipelineModuleExecutionContext,
} from '../../../../etl/pipeline/pipeline-module/type/pipeline-module.interface.js';
import { RelationshipLabelEnum } from '../../../../activity-graph/relationship-label.enum.js';
import { ActivityGraphService } from '../../../../activity-graph/activity-graph.service.js';
import { ENRICHMENT_EXTENSION } from '../../local-extension.constant.js';
import { ActivityInputReaderService } from '../graph/activity-input-reader.service.js';
import { DerivedGraphService } from '../graph/derived-graph.service.js';
import { buildDerivedProvenance } from '../graph/derived-graph.util.js';
import {
    type ArriveCandidate,
    type ConfirmationMethod,
    confirmEvents,
    type EventOutcome,
} from '../util/event-confirmation.util.js';
import { HomeTimeline } from '../util/home-timeline.util.js';
import { formatCount, positiveOr } from '../util/module-input.util.js';

const DEFAULTS = {
    windowMinutes: 60,
    minSimilarity: 0.6,
    homeRadiusKm: 1,
    allDayHours: 20,
    homeMaxGapDays: 60,
};
const REPORTED_SAMPLES = 25;

@PipelineModuleJsonSchema()
export class ConfirmEventsInput {
    /** Arrives within this many minutes of the event start can confirm it by place name. Default 60. */
    @Optional()
    @Type('number')
    public windowMinutes?: number;

    /** Normalised similarity (0..1) between event location and place name that counts as a match. Default 0.6. */
    @Optional()
    @Type('number')
    public minSimilarity?: number;

    /** Arrives within this distance (km) of home never serve as weak evidence. Default 1. */
    @Optional()
    @Type('number')
    public homeRadiusKm?: number;

    /** Events at least this many hours long are all-day events (name matches only). Default 20. */
    @Optional()
    @Type('number')
    public allDayHours?: number;
}

export interface ConfirmationSample {
    eventId: string;
    summary?: string;
    location?: string;
    start: string;
    placeName?: string;
    method: ConfirmationMethod;
    confidence: number;
    offsetMinutes: number;
}

export interface ConfirmEventsSummary {
    dryRun: boolean;
    options: typeof DEFAULTS;
    eventCount: number;
    eventsWithLocation: number;
    arriveCount: number;
    confirmed: number;
    unconfirmed: number;
    /** Per method (name, unnamed-place, overlap) and per reason an event stayed unconfirmed. */
    outcomes: Record<EventOutcome, number>;
    samples: ConfirmationSample[];
    replacedEdges: number;
    warnings: string[];
}

@PipelineModuleJsonSchema()
export class ConfirmEventsOutput {
    @Required()
    @Type('integer')
    public confirmedCount!: number;

    /** Confirmed / unconfirmed counts per method and reason, with samples. */
    @Required()
    @Type('object')
    public summary!: ConfirmEventsSummary;
}

/**
 * Confirms calendar events with location history: `(event)-[:CONFIRMED_BY {confidence, method}]->(arrive)` when an
 * arrive near the event start is at a place whose name matches the event location, or (weaker) when the owner was
 * somewhere other than home during an event without a usable location. Replaces its previous output.
 */
@PipelineModule({
    extensionName: ENRICHMENT_EXTENSION,
    inputType: ConfirmEventsInput,
    outputType: ConfirmEventsOutput,
    description:
        'Confirms calendar Events with Arrives: CONFIRMED_BY {confidence, method} when an arrive within windowMinutes ' +
        'of the start matches the event location by name, or weakly when the owner was away from home during an ' +
        'event without location. Replaces its previous output.',
})
export class ConfirmEventsPipelineModule implements IPipelineModule<ConfirmEventsInput, ConfirmEventsOutput> {
    constructor(
        private readonly reader: ActivityInputReaderService,
        private readonly derivedGraphService: DerivedGraphService,
        private readonly activityGraphService: ActivityGraphService,
    ) {}

    public async executeModule({
        em,
        inputData,
        pipelineExecution,
        currentNode,
        progress,
        dryRun,
    }: PipelineModuleExecutionContext<ConfirmEventsInput>): Promise<ConfirmEventsOutput> {
        const options = {
            windowMinutes: positiveOr(inputData.windowMinutes, DEFAULTS.windowMinutes),
            minSimilarity: Math.min(1, positiveOr(inputData.minSimilarity, DEFAULTS.minSimilarity)),
            homeRadiusKm: positiveOr(inputData.homeRadiusKm, DEFAULTS.homeRadiusKm),
            allDayHours: positiveOr(inputData.allDayHours, DEFAULTS.allDayHours),
            homeMaxGapDays: DEFAULTS.homeMaxGapDays,
        };
        const provenance = buildDerivedProvenance(currentNode.moduleId, pipelineExecution.id);
        const warnings: string[] = [];

        const owner = await this.activityGraphService.getOwnerActor(em);
        const ownerId = owner.get('id');

        if (!ownerId) {
            throw new Error('The owner person node has no id');
        }

        progress.message('Reading calendar events');
        const events = await this.reader.readEvents();
        progress.message('Reading home periods');
        const homePeriods = await this.reader.readHomePeriods(ownerId);

        if (homePeriods.length === 0) {
            warnings.push(
                'No HOME_DURING periods found: weak evidence cannot tell home from away and is less reliable.',
            );
        }

        progress.report({ message: 'Reading arrives', current: 0, unit: 'activities' });
        const arrives = await this.reader.readArrives((read) => progress.report({ current: read }));

        progress.message(
            `Matching ${formatCount(events.length)} events against ${formatCount(arrives.length)} arrives`,
        );
        const candidates: ArriveCandidate[] = arrives.map((arrive) => ({
            id: arrive.id,
            start: arrive.start,
            end: arrive.end,
            ...(arrive.placeId ? { placeId: arrive.placeId } : {}),
            ...(arrive.latitude !== undefined && arrive.longitude !== undefined
                ? { latitude: arrive.latitude, longitude: arrive.longitude }
                : {}),
            names: [...new Set([arrive.canonicalName, arrive.rawName].filter((name): name is string => !!name))],
        }));
        const homes = new HomeTimeline(homePeriods, { maxGapDays: options.homeMaxGapDays });
        const result = confirmEvents(events, candidates, homes, options);
        const rows = result.confirmations.map((confirmation) => ({
            fromId: confirmation.eventId,
            toId: confirmation.arriveId,
            props: {
                confidence: confirmation.confidence,
                method: confirmation.method,
                offsetMinutes: confirmation.offsetMinutes,
                ...(confirmation.similarity === undefined ? {} : { similarity: confirmation.similarity }),
            },
        }));

        const replacement = await this.derivedGraphService.replaceDerived(
            provenance,
            { nodeLabels: [], relationshipTypes: [RelationshipLabelEnum.CONFIRMED_BY] },
            {
                dryRun,
                write: () =>
                    this.derivedGraphService.writeRelationships(RelationshipLabelEnum.CONFIRMED_BY, rows, provenance),
            },
        );

        const eventById = new Map(events.map((event) => [event.id, event]));
        const arriveById = new Map(candidates.map((arrive) => [arrive.id, arrive]));
        // Samples from every method, so weak matches can be reviewed too.
        const samples = (['name', 'unnamed-place', 'overlap'] as const).flatMap((method) =>
            result.confirmations
                .filter((confirmation) => confirmation.method === method)
                .slice(0, Math.ceil(REPORTED_SAMPLES / 3))
                .map((confirmation): ConfirmationSample => {
                    const event = eventById.get(confirmation.eventId);
                    const placeName = arriveById.get(confirmation.arriveId)?.names[0];

                    return {
                        eventId: confirmation.eventId,
                        ...(event?.summary ? { summary: event.summary } : {}),
                        ...(event?.locationName ? { location: event.locationName } : {}),
                        start: new Date(event?.start ?? 0).toISOString(),
                        ...(placeName ? { placeName } : {}),
                        method: confirmation.method,
                        confidence: confirmation.confidence,
                        offsetMinutes: confirmation.offsetMinutes,
                    };
                }),
        );
        const confirmed = result.confirmations.length;

        progress.message(
            `${dryRun ? 'Would confirm' : 'Confirmed'} ${formatCount(confirmed)} of ${formatCount(events.length)} event(s)`,
        );

        return {
            confirmedCount: confirmed,
            summary: {
                dryRun,
                options,
                eventCount: events.length,
                eventsWithLocation: events.filter((event) => event.locationName).length,
                arriveCount: arrives.length,
                confirmed,
                unconfirmed: events.length - confirmed,
                outcomes: result.outcomes,
                samples,
                replacedEdges: replacement.replacedRelationships,
                warnings,
            },
        };
    }
}
