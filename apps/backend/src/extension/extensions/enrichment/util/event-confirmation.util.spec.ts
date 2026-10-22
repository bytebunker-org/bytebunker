import { describe, expect, it } from 'vitest';
import {
    type ArriveCandidate,
    type CalendarEvent,
    confirmEvents,
    type EventConfirmationOptions,
    normalisePlaceText,
    placeNameSimilarity,
} from './event-confirmation.util.js';
import { HomeTimeline } from './home-timeline.util.js';

const HOME = { latitude: 49.75, longitude: 6.64 };
const AWAY = { latitude: 49.8, longitude: 6.7 };
const t = (iso: string) => Date.parse(iso);

const homes = new HomeTimeline(
    [{ placeId: 'home', from: t('2024-01-01T00:00:00Z'), to: t('2024-12-31T00:00:00Z'), ...HOME }],
    { maxGapDays: 60 },
);
const options: EventConfirmationOptions = { windowMinutes: 60, minSimilarity: 0.6, homeRadiusKm: 1, allDayHours: 20 };

const event = (id: string, start: string, end: string | undefined, locationName?: string): CalendarEvent => ({
    id,
    start: t(start),
    ...(end ? { end: t(end) } : {}),
    ...(locationName ? { locationName } : {}),
});
const arrive = (
    id: string,
    start: string,
    end: string,
    names: string[],
    where: { latitude: number; longitude: number } = AWAY,
    placeId = `place-${id}`,
): ArriveCandidate => ({ id, start: t(start), end: t(end), names, placeId, ...where });

describe('placeNameSimilarity', () => {
    it('normalises case, diacritics, ß and punctuation', () => {
        expect(normalisePlaceText('  Café Müller-Straße, 5! ')).toBe('cafe muller strasse 5');
        expect(placeNameSimilarity('CAFÉ MÜLLER', 'Cafe Muller')).toBe(1);
    });

    it('matches a place name contained in a location with address', () => {
        expect(placeNameSimilarity('Mensa Petrisberg, Max-Planck-Str. 6, 54296 Trier', 'Mensa Petrisberg')).toBe(1);
        expect(placeNameSimilarity('Universitaet Trier', 'Universität Trier')).toBeGreaterThan(0.6);
    });

    it('scores unrelated names low and ignores house numbers and stop words', () => {
        expect(placeNameSimilarity('Hauptbahnhof Köln', 'Zahnarzt Dr. Schmidt')).toBeLessThan(0.4);
        expect(placeNameSimilarity('Bahnhofstr. 5', 'Am Markt 5')).toBeLessThan(0.6);
    });
});

describe('confirmEvents', () => {
    it('confirms by place name within the window and picks the best match', () => {
        const result = confirmEvents(
            [event('dentist', '2024-03-01T09:00:00Z', '2024-03-01T10:00:00Z', 'Zahnarztpraxis Dr. Schmidt, Trier')],
            [
                arrive('cafe', '2024-03-01T08:00:00Z', '2024-03-01T08:40:00Z', ['Café Central']),
                arrive('praxis', '2024-03-01T08:55:00Z', '2024-03-01T10:05:00Z', ['Zahnarztpraxis Dr. Schmidt']),
            ],
            homes,
            options,
        );

        expect(result.confirmations).toEqual([
            {
                eventId: 'dentist',
                arriveId: 'praxis',
                method: 'name',
                confidence: 1,
                similarity: 1,
                offsetMinutes: -5,
            },
        ]);
        expect(result.outcomes.name).toBe(1);
    });

    it('reports a mismatch when the only nearby places have other names', () => {
        const result = confirmEvents(
            [event('concert', '2024-03-01T19:00:00Z', '2024-03-01T22:00:00Z', 'Arena Trier')],
            [arrive('pub', '2024-03-01T18:30:00Z', '2024-03-01T23:00:00Z', ['Irish Pub'])],
            homes,
            options,
        );

        expect(result.confirmations).toEqual([]);
        expect(result.outcomes['location-mismatch']).toBe(1);
    });

    it('uses an unnamed place away from home as weaker evidence for an event with a location', () => {
        const result = confirmEvents(
            [event('meeting', '2024-03-01T14:00:00Z', '2024-03-01T15:00:00Z', 'Büro Kunde X')],
            [arrive('unnamed', '2024-03-01T13:50:00Z', '2024-03-01T15:10:00Z', [])],
            homes,
            options,
        );

        expect(result.confirmations).toMatchObject([{ arriveId: 'unnamed', method: 'unnamed-place', confidence: 0.4 }]);
    });

    it('takes presence away from home as weak evidence for events without location, never home', () => {
        const result = confirmEvents(
            [
                event('lunch', '2024-03-02T12:00:00Z', '2024-03-02T13:00:00Z'),
                event('call', '2024-03-02T16:00:00Z', undefined),
                event('zoom', '2024-03-02T18:00:00Z', '2024-03-02T19:00:00Z', 'https://zoom.us/j/123'),
            ],
            [
                arrive('restaurant', '2024-03-02T11:55:00Z', '2024-03-02T13:10:00Z', ['Pizzeria']),
                arrive('home', '2024-03-02T15:00:00Z', '2024-03-02T20:00:00Z', [], HOME, 'home'),
            ],
            homes,
            options,
        );

        expect(result.confirmations).toMatchObject([
            { eventId: 'lunch', arriveId: 'restaurant', method: 'overlap', confidence: 0.3 },
        ]);
        expect(result.outcomes).toMatchObject({ overlap: 1, 'only-at-home': 1, virtual: 1 });
    });

    it('confirms all-day events by name only, anywhere within the day', () => {
        const result = confirmEvents(
            [
                event('fair', '2024-03-03T00:00:00Z', '2024-03-04T00:00:00Z', 'Messe Frankfurt'),
                event('holiday', '2024-03-05T00:00:00Z', '2024-03-06T00:00:00Z'),
            ],
            [
                arrive('fair', '2024-03-03T13:00:00Z', '2024-03-03T16:00:00Z', ['Messe Frankfurt']),
                arrive('beach', '2024-03-05T10:00:00Z', '2024-03-05T16:00:00Z', ['Beach']),
            ],
            homes,
            options,
        );

        expect(result.confirmations.map((confirmation) => [confirmation.eventId, confirmation.method])).toEqual([
            ['fair', 'name'],
        ]);
        expect(result.outcomes['all-day-no-match']).toBe(1);
    });
});
