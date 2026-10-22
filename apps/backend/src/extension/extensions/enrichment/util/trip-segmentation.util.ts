import { DateTime } from 'luxon';
import { isValidLatLng, type LatLng } from './geo.util.js';
import type { HomeTimeline } from './home-timeline.util.js';
import { joinOverlappingIntervals } from './interval-join.util.js';

const HOUR_MS = 60 * 60 * 1000;

/**
 * Where the owner was at some time: an Arrive at its place (an interval), or one end of a Move (a point at the move's
 * start or end).
 */
export interface LocationObservation extends LatLng {
    activityId: string;
    kind: 'arrive' | 'move-origin' | 'move-target';
    start: number;
    end: number;
    /** Canonical place id (raw place id if not consolidated); arrives only. */
    placeId?: string;
    placeName?: string;
    /** False for nested visits (a shop inside a mall), which would count their dwell time twice. */
    topLevel: boolean;
}

export interface TripMove {
    id: string;
    start: number;
    end: number;
    mode: string;
    /** Straight-line distance between the move's endpoints, if both are known. */
    distanceKm?: number;
}

export interface TripOptions {
    /** Observations within this distance of the active home count as at home. */
    homeRadiusKm: number;
    /** An away period reaching this far from home is a trip regardless of its length. */
    minDistanceKm: number;
    /** An away period lasting this long is a trip if it also reached `minLongStayDistanceKm`. */
    minAwayHours: number;
    /** Keeps overnight stays in the home town (friends, partner) from becoming trips. 0 disables. */
    minLongStayDistanceKm: number;
    /** A gap without any observation longer than this splits an away period (and is not bridged to home). */
    maxDataGapHours: number;
    /** IANA zone used to count nights. */
    timezone: string;
}

export interface TripDestination {
    placeId: string;
    name?: string;
    latitude: number;
    longitude: number;
    dwellMs: number;
    visitCount: number;
    distanceKm: number;
}

export interface TripTransportMode {
    mode: string;
    moveCount: number;
    distanceKm: number;
}

export interface Trip {
    id: string;
    start: number;
    end: number;
    homePlaceId: string;
    maxDistanceKm: number;
    nights: number;
    /** Ranked by dwell time, longest first. */
    destinations: TripDestination[];
    /** Ranked by distance, longest first. */
    transportModes: TripTransportMode[];
    /** Arrive and move activities during the trip, in time order. */
    activityIds: string[];
    /** Which threshold made it a trip. */
    reason: 'distance' | 'duration';
}

export interface TripSegmentationResult {
    trips: Trip[];
    /** Away periods that met neither threshold (commutes, day trips nearby). */
    shortAwayPeriods: number;
    /** Observations without a home period near enough in time; they end any open away period. */
    observationsWithoutHome: number;
}

interface ClassifiedObservation {
    observation: LocationObservation;
    distanceKm: number;
    homePlaceId: string;
}

interface AwayRun {
    observations: ClassifiedObservation[];
    /** End of the at-home observation right before the run, if close enough to bridge. */
    previousHomeEnd?: number;
    lastEnd: number;
}

/**
 * Splits the owner's location history into at-home and away time, measured against the home active at each moment,
 * and returns the away periods that are trips: far enough (`minDistanceKm`) or long enough (`minAwayHours`, and at
 * least `minLongStayDistanceKm` away).
 *
 * A trip spans from the end of the last at-home observation before it to the start of the first one after it (so
 * the outbound and return journeys belong to it), unless more than `maxDataGapHours` lie in between; then it starts
 * or ends at its first or last away observation.
 */
export function segmentTrips(
    observations: LocationObservation[],
    homes: HomeTimeline,
    moves: TripMove[],
    options: TripOptions,
): TripSegmentationResult {
    const maxGapMs = options.maxDataGapHours * HOUR_MS;
    const sorted = observations
        .filter((observation) => Number.isFinite(observation.start) && isValidLatLng(observation))
        .map((observation) => ({
            ...observation,
            end: Number.isFinite(observation.end) ? Math.max(observation.end, observation.start) : observation.start,
        }))
        .sort((a, b) => a.start - b.start || a.end - b.end);

    const runs: { run: AwayRun; nextHomeStart?: number }[] = [];
    let observationsWithoutHome = 0;
    let lastHomeEnd: number | undefined;
    let run: AwayRun | undefined;

    const closeRun = (nextHomeStart?: number) => {
        if (run) {
            runs.push({ run, nextHomeStart });
            run = undefined;
        }
    };

    for (const observation of sorted) {
        const measured = homes.distanceFromHomeKm(observation.start, observation);

        if (!measured) {
            observationsWithoutHome++;
            closeRun();
            lastHomeEnd = undefined;
            continue;
        }

        if (measured.distanceKm <= options.homeRadiusKm) {
            closeRun(run && observation.start - run.lastEnd <= maxGapMs ? observation.start : undefined);
            lastHomeEnd = Math.max(lastHomeEnd ?? observation.end, observation.end);
            continue;
        }

        const classified = { observation, distanceKm: measured.distanceKm, homePlaceId: measured.home.placeId };

        if (run && observation.start - run.lastEnd > maxGapMs) {
            closeRun();
        }

        if (!run) {
            run = {
                observations: [],
                previousHomeEnd:
                    lastHomeEnd !== undefined && observation.start - lastHomeEnd <= maxGapMs
                        ? Math.min(lastHomeEnd, observation.start)
                        : undefined,
                lastEnd: observation.end,
            };
        }

        run.observations.push(classified);
        run.lastEnd = Math.max(run.lastEnd, observation.end);
    }

    closeRun();

    const trips: Trip[] = [];
    let shortAwayPeriods = 0;

    for (const { run: awayRun, nextHomeStart } of runs) {
        const trip = toTrip(awayRun, nextHomeStart, options);

        if (trip) {
            trips.push(trip);
        } else {
            shortAwayPeriods++;
        }
    }

    attachTransportModes(trips, moves);

    return { trips, shortAwayPeriods, observationsWithoutHome };
}

function toTrip(run: AwayRun, nextHomeStart: number | undefined, options: TripOptions): Trip | undefined {
    const first = run.observations[0]!.observation;
    const start = run.previousHomeEnd ?? first.start;
    const end = Math.max(start, nextHomeStart ?? run.lastEnd);
    const durationHours = (end - start) / HOUR_MS;
    const farthest = run.observations.reduce((best, current) =>
        current.distanceKm > best.distanceKm ? current : best,
    );
    const maxDistanceKm = farthest.distanceKm;

    const reason =
        maxDistanceKm >= options.minDistanceKm
            ? 'distance'
            : durationHours >= options.minAwayHours && maxDistanceKm >= options.minLongStayDistanceKm
              ? 'duration'
              : undefined;

    if (!reason) {
        return undefined;
    }

    const destinations = new Map<string, TripDestination>();

    for (const { observation, distanceKm } of run.observations) {
        if (observation.kind !== 'arrive' || !observation.topLevel || !observation.placeId) {
            continue;
        }

        const dwellMs = Math.max(0, Math.min(observation.end, end) - Math.max(observation.start, start));
        const destination = destinations.get(observation.placeId);

        if (destination) {
            destination.dwellMs += dwellMs;
            destination.visitCount++;
            destination.name ??= observation.placeName;
        } else {
            destinations.set(observation.placeId, {
                placeId: observation.placeId,
                ...(observation.placeName ? { name: observation.placeName } : {}),
                latitude: observation.latitude,
                longitude: observation.longitude,
                dwellMs,
                visitCount: 1,
                distanceKm,
            });
        }
    }

    return {
        id: `travel:${new Date(start).toISOString()}`,
        start,
        end,
        homePlaceId: farthest.homePlaceId,
        maxDistanceKm,
        nights: countNights(start, end, options.timezone),
        destinations: [...destinations.values()].sort(
            (a, b) => b.dwellMs - a.dwellMs || b.visitCount - a.visitCount || a.placeId.localeCompare(b.placeId),
        ),
        transportModes: [],
        activityIds: [...new Set(run.observations.map(({ observation }) => observation.activityId))],
        reason,
    };
}

/** Moves overlapping a trip (including the outbound and return journeys) give its transport modes. */
function attachTransportModes(trips: Trip[], moves: TripMove[]): void {
    const modesByTrip = new Map<Trip, Map<string, TripTransportMode>>();
    const movesByTrip = new Map<Trip, TripMove[]>();

    for (const { left: trip, right: move, overlapMs } of joinOverlappingIntervals(trips, moves)) {
        // A move that only touches the trip boundary belongs to the time at home.
        if (overlapMs <= 0 && move.end > move.start) {
            continue;
        }

        let modes = modesByTrip.get(trip);

        if (!modes) {
            modes = new Map();
            modesByTrip.set(trip, modes);
        }

        const mode = modes.get(move.mode) ?? { mode: move.mode, moveCount: 0, distanceKm: 0 };
        mode.moveCount++;
        mode.distanceKm += move.distanceKm ?? 0;
        modes.set(move.mode, mode);
        const tripMoves = movesByTrip.get(trip);

        if (tripMoves) {
            tripMoves.push(move);
        } else {
            movesByTrip.set(trip, [move]);
        }
    }

    for (const [trip, tripMoves] of movesByTrip) {
        const known = new Set(trip.activityIds);
        for (const move of tripMoves) {
            if (!known.has(move.id)) {
                trip.activityIds.push(move.id);
            }
        }
    }

    for (const [trip, modes] of modesByTrip) {
        trip.transportModes = [...modes.values()].sort(
            (a, b) => b.distanceKm - a.distanceKm || b.moveCount - a.moveCount || a.mode.localeCompare(b.mode),
        );
    }
}

/** Local midnights between start and end. */
export function countNights(start: number, end: number, timezone: string): number {
    const from = DateTime.fromMillis(start, { zone: timezone }).startOf('day');
    const to = DateTime.fromMillis(end, { zone: timezone }).startOf('day');

    if (!from.isValid || !to.isValid) {
        return Math.max(0, Math.floor((end - start) / (24 * HOUR_MS)));
    }

    return Math.max(0, Math.round(to.diff(from, 'days').days));
}

export interface TripsPerYear {
    year: number;
    trips: number;
    days: number;
    nights: number;
    farthestKm: number;
}

/** Trips counted in the (local) year they started. */
export function summariseTripsPerYear(trips: Trip[], timezone: string): TripsPerYear[] {
    const years = new Map<number, TripsPerYear>();

    for (const trip of trips) {
        const local = DateTime.fromMillis(trip.start, { zone: timezone });
        const year = local.isValid ? local.year : new Date(trip.start).getUTCFullYear();
        const entry = years.get(year) ?? { year, trips: 0, days: 0, nights: 0, farthestKm: 0 };

        entry.trips++;
        entry.days += (trip.end - trip.start) / (24 * HOUR_MS);
        entry.nights += trip.nights;
        entry.farthestKm = Math.max(entry.farthestKm, trip.maxDistanceKm);
        years.set(year, entry);
    }

    return [...years.values()]
        .sort((a, b) => a.year - b.year)
        .map((entry) => ({
            ...entry,
            days: Math.round(entry.days * 10) / 10,
            farthestKm: Math.round(entry.farthestKm),
        }));
}
