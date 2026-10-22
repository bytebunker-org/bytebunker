import { describe, expect, it } from 'vitest';
import { HomeTimeline } from './home-timeline.util.js';
import {
    countNights,
    type LocationObservation,
    segmentTrips,
    summariseTripsPerYear,
    type TripMove,
    type TripOptions,
} from './trip-segmentation.util.js';

const HOME = { latitude: 49.75, longitude: 6.64 };
/** A point `km` north of home (one degree of latitude ≈ 111.2 km). */
const north = (km: number) => ({ latitude: HOME.latitude + km / 111.2, longitude: HOME.longitude });
const t = (iso: string) => Date.parse(iso);

const options: TripOptions = {
    homeRadiusKm: 1,
    minDistanceKm: 100,
    minAwayHours: 20,
    minLongStayDistanceKm: 25,
    maxDataGapHours: 48,
    timezone: 'Europe/Berlin',
};

const homes = new HomeTimeline(
    [{ placeId: 'home', from: t('2024-01-01T00:00:00Z'), to: t('2024-12-31T00:00:00Z'), ...HOME }],
    { maxGapDays: 60 },
);

let counter = 0;

function arrive(placeId: string, km: number, start: string, end: string, name?: string): LocationObservation {
    return {
        activityId: `arrive-${++counter}`,
        kind: 'arrive',
        start: t(start),
        end: t(end),
        ...north(km),
        placeId,
        ...(name ? { placeName: name } : {}),
        topLevel: true,
    };
}

function move(
    fromKm: number,
    toKm: number,
    start: string,
    end: string,
    mode: string,
): { observations: LocationObservation[]; move: TripMove } {
    const id = `move-${++counter}`;

    return {
        observations: [
            { activityId: id, kind: 'move-origin', start: t(start), end: t(start), ...north(fromKm), topLevel: false },
            { activityId: id, kind: 'move-target', start: t(end), end: t(end), ...north(toKm), topLevel: false },
        ],
        move: { id, start: t(start), end: t(end), mode, distanceKm: Math.abs(toKm - fromKm) },
    };
}

function scenario(parts: (LocationObservation | ReturnType<typeof move>)[]) {
    const observations: LocationObservation[] = [];
    const moves: TripMove[] = [];

    for (const part of parts) {
        if ('move' in part) {
            observations.push(...part.observations);
            moves.push(part.move);
        } else {
            observations.push(part);
        }
    }

    return segmentTrips(observations, homes, moves, options);
}

describe('segmentTrips', () => {
    it('turns a far trip into one Travel spanning the outbound and return journeys', () => {
        const result = scenario([
            arrive('home', 0, '2024-03-01T00:00:00Z', '2024-03-03T08:00:00Z'),
            move(0, 300, '2024-03-03T08:00:00Z', '2024-03-03T12:00:00Z', 'IN_TRAIN'),
            arrive('museum', 300, '2024-03-03T12:00:00Z', '2024-03-03T17:00:00Z', 'Louvre'),
            arrive('hotel', 301, '2024-03-03T18:00:00Z', '2024-03-05T09:00:00Z', 'Hotel'),
            arrive('museum', 300, '2024-03-05T09:30:00Z', '2024-03-05T09:45:00Z', 'Louvre'),
            move(300, 300.5, '2024-03-05T09:45:00Z', '2024-03-05T10:00:00Z', 'WALKING'),
            move(300, 0, '2024-03-05T10:00:00Z', '2024-03-05T14:00:00Z', 'IN_TRAIN'),
            arrive('home', 0, '2024-03-05T14:00:00Z', '2024-03-06T08:00:00Z'),
        ]);

        expect(result.trips).toHaveLength(1);
        const [trip] = result.trips;

        expect(trip).toMatchObject({
            id: 'travel:2024-03-03T08:00:00.000Z',
            start: t('2024-03-03T08:00:00Z'),
            end: t('2024-03-05T14:00:00Z'),
            homePlaceId: 'home',
            nights: 2,
            reason: 'distance',
        });
        expect(trip!.maxDistanceKm).toBeCloseTo(301, 0);
        expect(trip!.destinations.map((destination) => [destination.placeId, destination.visitCount])).toEqual([
            ['hotel', 1],
            ['museum', 2],
        ]);
        expect(trip!.transportModes).toEqual([
            { mode: 'IN_TRAIN', moveCount: 2, distanceKm: 600 },
            { mode: 'WALKING', moveCount: 1, distanceKm: 0.5 },
        ]);
        // 3 arrives + 3 moves; the arrives at home before and after are not part of it.
        expect(trip!.activityIds).toHaveLength(6);
    });

    it('ignores commutes and nights at friends in the home town, but keeps a long stay further away', () => {
        const result = scenario([
            arrive('home', 0, '2024-04-01T00:00:00Z', '2024-04-01T07:00:00Z'),
            move(0, 20, '2024-04-01T07:00:00Z', '2024-04-01T07:30:00Z', 'IN_PASSENGER_VEHICLE'),
            arrive('work', 20, '2024-04-01T07:30:00Z', '2024-04-01T17:00:00Z'),
            move(20, 0, '2024-04-01T17:00:00Z', '2024-04-01T17:30:00Z', 'IN_PASSENGER_VEHICLE'),
            arrive('home', 0, '2024-04-01T17:30:00Z', '2024-04-02T18:00:00Z'),
            // A night at a friend's, 3 km away.
            arrive('friend', 3, '2024-04-02T18:30:00Z', '2024-04-03T18:00:00Z'),
            arrive('home', 0, '2024-04-03T18:30:00Z', '2024-04-05T10:00:00Z'),
            // 30 hours 60 km away.
            arrive('aunt', 60, '2024-04-05T11:00:00Z', '2024-04-06T17:00:00Z'),
            arrive('home', 0, '2024-04-06T18:00:00Z', '2024-04-07T10:00:00Z'),
        ]);

        expect(result.trips.map((trip) => [trip.reason, trip.destinations[0]?.placeId])).toEqual([
            ['duration', 'aunt'],
        ]);
        expect(result.shortAwayPeriods).toBe(2);
    });

    it('splits away periods at long data gaps and does not bridge them to home', () => {
        const result = scenario([
            arrive('home', 0, '2024-05-01T00:00:00Z', '2024-05-01T08:00:00Z'),
            arrive('far', 200, '2024-05-04T08:00:00Z', '2024-05-04T10:00:00Z'),
            arrive('far', 200, '2024-05-10T08:00:00Z', '2024-05-10T10:00:00Z'),
            arrive('home', 0, '2024-05-10T20:00:00Z', '2024-05-11T08:00:00Z'),
        ]);

        expect(
            result.trips.map((trip) => [new Date(trip.start).toISOString(), new Date(trip.end).toISOString()]),
        ).toEqual([
            ['2024-05-04T08:00:00.000Z', '2024-05-04T10:00:00.000Z'],
            ['2024-05-10T08:00:00.000Z', '2024-05-10T20:00:00.000Z'],
        ]);
    });

    it('does not count locations without a home period near in time', () => {
        const result = scenario([arrive('far', 500, '2026-06-01T00:00:00Z', '2026-06-05T00:00:00Z')]);

        expect(result.trips).toEqual([]);
        expect(result.observationsWithoutHome).toBe(1);
    });
});

describe('HomeTimeline', () => {
    const timeline = new HomeTimeline(
        [
            { placeId: 'b', from: t('2024-06-01T00:00:00Z'), to: t('2024-12-31T00:00:00Z'), ...HOME },
            { placeId: 'a', from: t('2023-01-01T00:00:00Z'), to: t('2024-04-01T00:00:00Z'), ...HOME },
        ],
        { maxGapDays: 20 },
    );

    it('returns the containing period, else the nearest one within the gap', () => {
        expect(timeline.homeAt(t('2023-06-01T00:00:00Z'))?.placeId).toBe('a');
        expect(timeline.homeAt(t('2024-04-10T00:00:00Z'))?.placeId).toBe('a');
        expect(timeline.homeAt(t('2024-05-20T00:00:00Z'))?.placeId).toBe('b');
        expect(timeline.homeAt(t('2024-05-01T00:00:00Z'))).toBeUndefined();
        expect(timeline.homeAt(t('2022-01-01T00:00:00Z'))).toBeUndefined();
    });
});

describe('countNights / summariseTripsPerYear', () => {
    it('counts local midnights', () => {
        // 23:30 UTC on 31 Dec is already 1 Jan in Berlin.
        expect(countNights(t('2024-12-31T23:30:00Z'), t('2025-01-01T20:00:00Z'), 'Europe/Berlin')).toBe(0);
        expect(countNights(t('2024-03-03T08:00:00Z'), t('2024-03-05T14:00:00Z'), 'Europe/Berlin')).toBe(2);
    });

    it('groups trips by local start year', () => {
        const trip = (start: string, end: string, km: number) => ({
            id: start,
            start: t(start),
            end: t(end),
            homePlaceId: 'home',
            maxDistanceKm: km,
            nights: countNights(t(start), t(end), 'Europe/Berlin'),
            destinations: [],
            transportModes: [],
            activityIds: [],
            reason: 'distance' as const,
        });

        expect(
            summariseTripsPerYear(
                [
                    trip('2024-12-31T23:30:00Z', '2025-01-02T23:30:00Z', 150),
                    trip('2024-03-03T00:00:00Z', '2024-03-04T12:00:00Z', 300),
                ],
                'Europe/Berlin',
            ),
        ).toEqual([
            { year: 2024, trips: 1, days: 1.5, nights: 1, farthestKm: 300 },
            { year: 2025, trips: 1, days: 2, nights: 2, farthestKm: 150 },
        ]);
    });
});
