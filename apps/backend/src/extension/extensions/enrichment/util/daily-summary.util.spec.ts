import { describe, expect, it } from 'vitest';
import { DailySummaryAccumulator } from './daily-summary.util.js';

const t = (iso: string) => Date.parse(iso);

describe('DailySummaryAccumulator', () => {
    it('groups by local day and aggregates counts, places, distances and listening time', () => {
        const accumulator = new DailySummaryAccumulator('Europe/Berlin', { collectActivityIds: true });

        // 23:30 UTC on 1 March is 00:30 on 2 March in Berlin.
        accumulator.addArrive({
            id: 'a1',
            start: t('2024-03-01T23:30:00Z'),
            end: t('2024-03-04T08:00:00Z'),
            placeId: 'home',
            topLevel: true,
        });
        accumulator.addArrive({
            id: 'a2',
            start: t('2024-03-02T10:00:00Z'),
            end: t('2024-03-02T11:00:00Z'),
            placeId: 'shop',
            topLevel: false,
        });
        accumulator.addMove({ id: 'm1', start: t('2024-03-02T09:00:00Z'), mode: 'WALKING', distanceKm: 1.25 });
        accumulator.addMove({ id: 'm2', start: t('2024-03-02T12:00:00Z'), mode: 'IN_TRAIN', distanceKm: 80 });
        accumulator.addMove({ id: 'm3', start: t('2024-03-02T18:00:00Z'), mode: 'IN_TRAIN', distanceKm: 80 });
        accumulator.addListen({ start: t('2024-03-02T12:00:00Z'), end: t('2024-03-02T12:03:00Z') });
        accumulator.addListen({ start: t('2024-03-02T12:03:00Z'), msPlayed: 90_000 });
        accumulator.addListen({ start: t('2024-03-02T12:05:00Z') });
        accumulator.addView({ start: t('2024-03-02T20:00:00Z') });
        accumulator.addEvent({ id: 'e1', start: t('2024-03-02T15:00:00Z') });
        accumulator.addTravel({ id: 'travel:1', start: t('2024-03-02T11:00:00Z'), end: t('2024-03-02T19:00:00Z') });

        const days = accumulator.build();

        expect(days.map((day) => day.date)).toEqual(['2024-03-02', '2024-03-03', '2024-03-04']);
        expect(days[0]).toMatchObject({
            id: 'daily-summary:2024-03-02',
            timezone: 'Europe/Berlin',
            startTime: '2024-03-01T23:00:00.000Z',
            endTime: '2024-03-02T23:00:00.000Z',
            activityCount: 10,
            arriveCount: 2,
            moveCount: 3,
            listenCount: 3,
            viewCount: 1,
            eventCount: 1,
            // The nested visit counts as an arrive, but not as a distinct place.
            placeCount: 1,
            placeIds: ['home'],
            moveDistanceKm: 161.3,
            moveModes: ['IN_TRAIN', 'WALKING'],
            moveModeKm: [160, 1.3],
            moveModeCounts: [2, 1],
            listeningMinutes: 4.5,
            listensWithoutDuration: 1,
            onTrip: true,
            travelIds: ['travel:1'],
            activityIds: ['a1', 'a2', 'm1', 'm2', 'm3', 'e1'],
        });
        // The multi-day arrive puts its place on the following days too.
        expect(days[1]).toMatchObject({ activityCount: 0, placeIds: ['home'], onTrip: false });
        expect(days[2]).toMatchObject({ placeIds: ['home'] });
    });

    it('rejects unknown time zones', () => {
        expect(() => new DailySummaryAccumulator('Mars/Olympus')).toThrow(/Unknown timezone/);
    });
});
