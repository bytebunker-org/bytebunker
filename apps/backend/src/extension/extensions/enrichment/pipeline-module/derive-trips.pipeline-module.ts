import { Optional, Required, Type } from 'ts-decorator-json-schema-generator';
import { PipelineModule } from '../../../../etl/pipeline/pipeline-module/decorator/pipeline-module.decorator.js';
import { PipelineModuleJsonSchema } from '../../../../etl/pipeline/pipeline-module/decorator/pipeline-module-json-schema.decorator.js';
import type {
    IPipelineModule,
    PipelineModuleExecutionContext,
} from '../../../../etl/pipeline/pipeline-module/type/pipeline-module.interface.js';
import { NodeLabelEnum } from '../../../../activity-graph/node-label.enum.js';
import { RelationshipLabelEnum } from '../../../../activity-graph/relationship-label.enum.js';
import { ActivityGraphService } from '../../../../activity-graph/activity-graph.service.js';
import { ENRICHMENT_EXTENSION } from '../../local-extension.constant.js';
import {
    ActivityInputReaderService,
    type ArriveInput,
    type MoveInput,
} from '../graph/activity-input-reader.service.js';
import { DerivedGraphService } from '../graph/derived-graph.service.js';
import { PlaceGeocodeService } from '../graph/place-geocode.service.js';
import { geocodedTripName } from '../util/trip-naming.util.js';
import {
    buildDerivedProvenance,
    type DerivedNodeRow,
    type DerivedRelationshipRow,
} from '../graph/derived-graph.util.js';
import { HomeTimeline } from '../util/home-timeline.util.js';
import { joinOverlappingIntervals } from '../util/interval-join.util.js';
import { formatCount, nonNegativeOr, positiveOr, round, timezoneOr } from '../util/module-input.util.js';
import {
    type LocationObservation,
    segmentTrips,
    summariseTripsPerYear,
    type Trip,
    type TripsPerYear,
} from '../util/trip-segmentation.util.js';

const DEFAULTS = {
    minDistanceKm: 100,
    minAwayHours: 20,
    homeRadiusKm: 1,
    minLongStayDistanceKm: 25,
    maxDataGapHours: 48,
    homeMaxGapDays: 60,
    maxDestinationsPerTrip: 20,
    maxIncludesPerTrip: 1000,
};
const REPORTED_TRIPS = 15;

@PipelineModuleJsonSchema()
export class DeriveTripsInput {
    /** An away period reaching this far (km) from home is a trip, however short. Default 100. */
    @Optional()
    @Type('number')
    public minDistanceKm?: number;

    /** An away period lasting this many hours is a trip if it also reached minLongStayDistanceKm. Default 20. */
    @Optional()
    @Type('number')
    public minAwayHours?: number;

    /** Minimum distance (km) for the minAwayHours rule, so nights at friends' in the home town are no trips. Default 25; 0 disables. */
    @Optional()
    @Type('number')
    public minLongStayDistanceKm?: number;

    /** Locations within this distance (km) of the home place count as at home. Default 1. */
    @Optional()
    @Type('number')
    public homeRadiusKm?: number;

    /** A stretch without location data longer than this (hours) splits a trip. Default 48. */
    @Optional()
    @Type('number')
    public maxDataGapHours?: number;

    /** Between home periods, the nearer one still applies up to this many days away. Default 60. */
    @Optional()
    @Type('number')
    public homeMaxGapDays?: number;

    /** IANA timezone used to count nights and years. Default Europe/Berlin. */
    @Optional()
    @Type('string')
    public timezone?: string;

    /** Destination places linked per trip (TO, ranked by dwell time). Default 20. */
    @Optional()
    @Type('integer')
    public maxDestinationsPerTrip?: number;

    /** INCLUDES edges per trip; longer trips store the full count in includedActivityCount. Default 1000. */
    @Optional()
    @Type('integer')
    public maxIncludesPerTrip?: number;
}

export interface TripSummaryEntry {
    id: string;
    name: string;
    start: string;
    end: string;
    days: number;
    distanceKm: number;
    reason: Trip['reason'];
    destinations: string[];
    transportModes: string[];
}

export interface DeriveTripsSummary {
    dryRun: boolean;
    options: typeof DEFAULTS & { timezone: string };
    homePeriodCount: number;
    arriveCount: number;
    moveCount: number;
    eventCount: number;
    tripCount: number;
    tripsPerYear: TripsPerYear[];
    /** Trips named after a geocoded destination (the rest: first named destination or distance). */
    tripsNamedByCity: number;
    /** Away periods that met neither threshold. */
    shortAwayPeriods: number;
    /** Locations with no home period near enough in time; they cannot belong to a trip. */
    observationsWithoutHome: number;
    longestTrips: TripSummaryEntry[];
    farthestTrips: TripSummaryEntry[];
    includesWritten: number;
    tripsWithTruncatedIncludes: number;
    replacedTrips: number;
    replacedEdges: number;
    warnings: string[];
}

@PipelineModuleJsonSchema()
export class DeriveTripsOutput {
    @Required()
    @Type('integer')
    public tripCount!: number;

    /** Trips per year, longest and farthest trips, thresholds used. */
    @Required()
    @Type('object')
    public summary!: DeriveTripsSummary;
}

/**
 * Derives trips: periods away from the home active at the time (HOME_DURING), far enough or long enough. Each trip is
 * a `Travel` activity with its destinations (`TO`, ranked by dwell time), transport modes from its moves, `INCLUDES`
 * edges to its arrives, moves and calendar events, and the owner as actor. Replaces its previous output.
 */
@PipelineModule({
    extensionName: ENRICHMENT_EXTENSION,
    inputType: DeriveTripsInput,
    outputType: DeriveTripsOutput,
    progressWeight: 2,
    description:
        'Derives Travel activities (trips away from home: > minDistanceKm or >= minAwayHours) from arrives, moves and ' +
        'HOME_DURING periods, with destinations (TO), transport modes and INCLUDES edges. Run after derive-home-work. ' +
        'Replaces its previous output.',
})
export class DeriveTripsPipelineModule implements IPipelineModule<DeriveTripsInput, DeriveTripsOutput> {
    constructor(
        private readonly reader: ActivityInputReaderService,
        private readonly derivedGraphService: DerivedGraphService,
        private readonly activityGraphService: ActivityGraphService,
        private readonly placeGeocodeService: PlaceGeocodeService,
    ) {}

    public async executeModule({
        em,
        inputData,
        pipelineExecution,
        currentNode,
        progress,
        dryRun,
    }: PipelineModuleExecutionContext<DeriveTripsInput>): Promise<DeriveTripsOutput> {
        const options = {
            minDistanceKm: positiveOr(inputData.minDistanceKm, DEFAULTS.minDistanceKm),
            minAwayHours: positiveOr(inputData.minAwayHours, DEFAULTS.minAwayHours),
            homeRadiusKm: positiveOr(inputData.homeRadiusKm, DEFAULTS.homeRadiusKm),
            minLongStayDistanceKm: nonNegativeOr(inputData.minLongStayDistanceKm, DEFAULTS.minLongStayDistanceKm),
            maxDataGapHours: positiveOr(inputData.maxDataGapHours, DEFAULTS.maxDataGapHours),
            homeMaxGapDays: nonNegativeOr(inputData.homeMaxGapDays, DEFAULTS.homeMaxGapDays),
            maxDestinationsPerTrip: Math.round(
                positiveOr(inputData.maxDestinationsPerTrip, DEFAULTS.maxDestinationsPerTrip),
            ),
            maxIncludesPerTrip: Math.round(nonNegativeOr(inputData.maxIncludesPerTrip, DEFAULTS.maxIncludesPerTrip)),
            timezone: timezoneOr(inputData.timezone),
        };
        const provenance = buildDerivedProvenance(currentNode.moduleId, pipelineExecution.id);
        const warnings: string[] = [];

        const owner = await this.activityGraphService.getOwnerActor(em);
        const ownerId = owner.get('id');

        if (!ownerId) {
            throw new Error('The owner person node has no id');
        }

        progress.message('Reading home periods');
        const homePeriods = await this.reader.readHomePeriods(ownerId);

        if (homePeriods.length === 0) {
            warnings.push('No HOME_DURING periods found: run enrichment:derive-home-work first. No trips derived.');
        }

        progress.report({ message: 'Reading arrives', current: 0, unit: 'activities' });
        const arrives = await this.reader.readArrives((read) => progress.report({ current: read }));
        progress.report({ message: 'Reading moves', current: arrives.length });
        const moves = await this.reader.readMoves((read) => progress.report({ current: arrives.length + read }));
        progress.message('Reading calendar events');
        const events = await this.reader.readEvents();

        progress.message(`Segmenting ${formatCount(arrives.length + moves.length)} arrives and moves into trips`);
        const homes = new HomeTimeline(homePeriods, { maxGapDays: options.homeMaxGapDays });
        const segmentation = segmentTrips(
            toObservations(arrives, moves),
            homes,
            moves.map((move) => ({
                id: move.id,
                start: move.start,
                end: move.end,
                mode: move.mode,
                ...(move.distanceKm === undefined ? {} : { distanceKm: move.distanceKm }),
            })),
            options,
        );
        const trips = segmentation.trips;

        for (const { left: trip, right: event, overlapMs } of joinOverlappingIntervals(
            trips,
            events.map((event) => ({ id: event.id, start: event.start, end: event.end ?? event.start })),
        )) {
            if (overlapMs > 0 || event.start > trip.start) {
                trip.activityIds.push(event.id);
            }
        }

        progress.message('Naming trips');
        const tripNames = await this.nameTrips(trips);
        const nameOf = (trip: Trip) => tripNames.get(trip.id) ?? fallbackTripName(trip);
        const nodes: DerivedNodeRow[] = trips.map((trip) => ({
            id: trip.id,
            props: toTravelProps(trip, nameOf(trip), options),
        }));
        const destinationRows: DerivedRelationshipRow[] = trips.flatMap((trip) =>
            trip.destinations.slice(0, options.maxDestinationsPerTrip).map((destination, index) => ({
                fromId: trip.id,
                toId: destination.placeId,
                props: {
                    rank: index + 1,
                    dwellMinutes: Math.round(destination.dwellMs / 60_000),
                    visitCount: destination.visitCount,
                    distanceKm: round(destination.distanceKm),
                },
            })),
        );
        const includeRows: DerivedRelationshipRow[] = trips.flatMap((trip) =>
            trip.activityIds.slice(0, options.maxIncludesPerTrip).map((activityId) => ({
                fromId: trip.id,
                toId: activityId,
                props: {},
            })),
        );
        const actorRows: DerivedRelationshipRow[] = trips.map((trip) => ({
            fromId: ownerId,
            toId: trip.id,
            props: {},
        }));
        const total = nodes.length + destinationRows.length + includeRows.length + actorRows.length;

        if (!dryRun) {
            progress.report({ current: 0, total, unit: 'nodes and edges', message: 'Writing trips' });
        }

        const replacement = await this.derivedGraphService.replaceDerived(
            provenance,
            {
                nodeLabels: [NodeLabelEnum.ACTIVITY_TRAVEL],
                relationshipTypes: [
                    RelationshipLabelEnum.TO,
                    RelationshipLabelEnum.INCLUDES,
                    RelationshipLabelEnum.ACTED_IN,
                ],
            },
            {
                dryRun,
                write: async () => {
                    let offset = 0;
                    const report = (written: number) => progress.report({ current: offset + written, total });

                    await this.derivedGraphService.writeNodes(
                        NodeLabelEnum.ACTIVITY_TRAVEL,
                        nodes,
                        provenance,
                        report,
                        [NodeLabelEnum.ACTIVITY],
                    );
                    offset += nodes.length;

                    for (const [type, rows] of [
                        [RelationshipLabelEnum.ACTED_IN, actorRows],
                        [RelationshipLabelEnum.TO, destinationRows],
                        [RelationshipLabelEnum.INCLUDES, includeRows],
                    ] as const) {
                        await this.derivedGraphService.writeRelationships(type, rows, provenance, report);
                        offset += rows.length;
                    }
                },
            },
        );

        const entry = (trip: Trip): TripSummaryEntry => ({
            id: trip.id,
            name: nameOf(trip),
            start: new Date(trip.start).toISOString(),
            end: new Date(trip.end).toISOString(),
            days: round((trip.end - trip.start) / 86_400_000),
            distanceKm: Math.round(trip.maxDistanceKm),
            reason: trip.reason,
            destinations: trip.destinations.slice(0, 5).map((destination) => destination.name ?? destination.placeId),
            transportModes: trip.transportModes.map((mode) => mode.mode),
        });

        progress.message(`${dryRun ? 'Would derive' : 'Derived'} ${formatCount(trips.length)} trip(s)`);

        return {
            tripCount: trips.length,
            summary: {
                dryRun,
                options,
                homePeriodCount: homePeriods.length,
                arriveCount: arrives.length,
                moveCount: moves.length,
                eventCount: events.length,
                tripCount: trips.length,
                tripsPerYear: summariseTripsPerYear(trips, options.timezone),
                shortAwayPeriods: segmentation.shortAwayPeriods,
                observationsWithoutHome: segmentation.observationsWithoutHome,
                longestTrips: [...trips]
                    .sort((a, b) => b.end - b.start - (a.end - a.start))
                    .slice(0, REPORTED_TRIPS)
                    .map(entry),
                farthestTrips: [...trips]
                    .sort((a, b) => b.maxDistanceKm - a.maxDistanceKm)
                    .slice(0, REPORTED_TRIPS)
                    .map(entry),
                tripsNamedByCity: tripNames.size,
                includesWritten: includeRows.length,
                tripsWithTruncatedIncludes: trips.filter((trip) => trip.activityIds.length > options.maxIncludesPerTrip)
                    .length,
                replacedTrips: replacement.replacedNodes,
                replacedEdges: replacement.replacedRelationships,
                warnings,
            },
        };
    }

    /** Names from the destinations' city and country (enrichment:geocode-places-offline); trips without one are left out. */
    private async nameTrips(trips: Trip[]): Promise<Map<string, string>> {
        const placeIds = trips.flatMap((trip) => [
            trip.homePlaceId,
            ...trip.destinations.map((destination) => destination.placeId),
        ]);
        const geocodes = await this.placeGeocodeService.readGeocodes(placeIds);
        const names = new Map<string, string>();

        for (const trip of trips) {
            const name = geocodedTripName(trip.destinations, geocodes, geocodes.get(trip.homePlaceId)?.countryCode);

            if (name) {
                names.set(trip.id, name);
            }
        }

        return names;
    }
}

/** Arrives at their place, moves as two points: the origin when they start, the target when they end. */
export function toObservations(arrives: ArriveInput[], moves: MoveInput[]): LocationObservation[] {
    const observations: LocationObservation[] = [];

    for (const arrive of arrives) {
        if (arrive.latitude === undefined || arrive.longitude === undefined) {
            continue;
        }

        const placeName = arrive.canonicalName ?? arrive.rawName;

        observations.push({
            activityId: arrive.id,
            kind: 'arrive',
            start: arrive.start,
            end: arrive.end,
            latitude: arrive.latitude,
            longitude: arrive.longitude,
            ...(arrive.placeId ? { placeId: arrive.placeId } : {}),
            ...(placeName ? { placeName } : {}),
            topLevel: arrive.hierarchyLevel === 0,
        });
    }

    for (const move of moves) {
        for (const [kind, point, time] of [
            ['move-origin', move.origin, move.start],
            ['move-target', move.target, move.end],
        ] as const) {
            if (point) {
                observations.push({
                    activityId: move.id,
                    kind,
                    start: time,
                    end: time,
                    latitude: point.latitude,
                    longitude: point.longitude,
                    topLevel: false,
                });
            }
        }
    }

    return observations;
}

function fallbackTripName(trip: Trip): string {
    const destination = trip.destinations.find((candidate) => candidate.name)?.name;

    return destination ? `Trip to ${destination}` : `Trip ${Math.round(trip.maxDistanceKm)} km from home`;
}

function toTravelProps(trip: Trip, name: string, options: { maxIncludesPerTrip: number }): Record<string, unknown> {
    return {
        type: NodeLabelEnum.ACTIVITY_TRAVEL,
        name,
        startTime: new Date(trip.start).toISOString(),
        endTime: new Date(trip.end).toISOString(),
        distanceKm: round(trip.maxDistanceKm),
        durationHours: round((trip.end - trip.start) / 3_600_000),
        nights: trip.nights,
        reason: trip.reason,
        homePlaceId: trip.homePlaceId,
        destinationCount: trip.destinations.length,
        ...(trip.transportModes[0] ? { primaryTransportMode: trip.transportModes[0].mode } : {}),
        transportModes: trip.transportModes.map((mode) => mode.mode),
        transportModeKm: trip.transportModes.map((mode) => round(mode.distanceKm)),
        transportModeCounts: trip.transportModes.map((mode) => mode.moveCount),
        includedActivityCount: trip.activityIds.length,
        includesTruncated: trip.activityIds.length > options.maxIncludesPerTrip,
    };
}
