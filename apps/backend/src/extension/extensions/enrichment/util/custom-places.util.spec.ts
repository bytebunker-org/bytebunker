import { describe, expect, it } from 'vitest';
import { CustomPlaceRoleEnum } from '../custom-place/dto/custom-place-role.enum.js';
import {
    type ArriveVisitRow,
    assignCustomPlaces,
    classifyRoleVisits,
    type CustomPlaceRule,
    customPlaceProps,
    deriveRoleTimeline,
    isValidAt,
    matchCustomPlace,
    matchCustomPlaces,
    validityInterval,
} from './custom-places.util.js';
import type { RoleVisit } from './role-periods.util.js';

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2020, 0, 1);
/** ~111 m per 0.001° latitude. */
const METERS_PER_MILLIDEGREE = 111.2;
const options = { maxGapDays: 60, minTakeoverVisits: 3 };

function rule(overrides: Partial<CustomPlaceRule> & Pick<CustomPlaceRule, 'id'>): CustomPlaceRule {
    return {
        name: `Place ${overrides.id}`,
        latitude: 50,
        longitude: 8,
        radiusMeters: 75,
        role: CustomPlaceRoleEnum.OTHER,
        ...overrides,
    };
}

/** A point `meters` north of 50/8. */
function north(meters: number): { latitude: number; longitude: number } {
    return { latitude: 50 + meters / METERS_PER_MILLIDEGREE / 1000, longitude: 8 };
}

function nights(placeId: string, days: number[], semanticType: string | null = 'HOME'): ArriveVisitRow[] {
    return days.map((day) => ({
        placeId,
        start: T0 + day * DAY + 20 * 3_600_000,
        end: T0 + (day + 1) * DAY + 7 * 3_600_000,
        semanticType,
    }));
}

function range(from: number, to: number): number[] {
    return Array.from({ length: to - from + 1 }, (_, index) => from + index);
}

function day(time: number): number {
    return Math.floor((time - T0) / DAY);
}

describe('matchCustomPlace', () => {
    it('matches within the radius only', () => {
        const home = rule({ id: 1, radiusMeters: 50 });

        expect(matchCustomPlace(north(30), [home])?.customPlace.id).toBe(1);
        expect(matchCustomPlace(north(30), [home])?.distanceMeters).toBeCloseTo(30, 0);
        expect(matchCustomPlace(north(60), [home])).toBeUndefined();
    });

    it('picks the smallest distance relative to the radius when several match', () => {
        const campus = rule({ id: 1, radiusMeters: 1000 });
        const office = rule({ id: 2, radiusMeters: 50, ...north(100) });

        // 90 m from the campus centre (0.09 of its radius), 10 m from the office (0.2 of its radius)
        expect(matchCustomPlace(north(90), [campus, office])?.customPlace.id).toBe(1);
        // 100 m from the campus centre (0.1), 0 m from the office (0)
        expect(matchCustomPlace(north(100), [campus, office])?.customPlace.id).toBe(2);
    });

    it('matches lists of places and ignores zero radii', () => {
        const matches = matchCustomPlaces(
            [
                { id: 'a', ...north(10) },
                { id: 'b', ...north(500) },
            ],
            [rule({ id: 1 }), rule({ id: 2, radiusMeters: 0, ...north(500) })],
        );

        expect([...matches.keys()]).toEqual(['a']);
    });
});

describe('customPlaceProps', () => {
    it('sets or clears the custom properties', () => {
        const home = rule({ id: 3, name: 'Zuhause', role: CustomPlaceRoleEnum.HOME });

        expect(customPlaceProps({ customPlace: home, distanceMeters: 1 })).toEqual({
            customPlaceId: 3,
            customRole: 'home',
            customName: 'Zuhause',
        });
        expect(customPlaceProps(undefined)).toEqual({ customPlaceId: null, customRole: null, customName: null });
    });
});

describe('validity', () => {
    it('treats validFrom/validTo as inclusive UTC days', () => {
        const place = rule({ id: 1, validFrom: '2020-01-01', validTo: '2020-01-31' });

        expect(validityInterval(place)).toEqual({ from: T0, to: T0 + 31 * DAY });
        expect(isValidAt(place, T0 - 1)).toBe(false);
        expect(isValidAt(place, T0)).toBe(true);
        expect(isValidAt(place, T0 + 31 * DAY - 1)).toBe(true);
        expect(isValidAt(place, T0 + 31 * DAY)).toBe(false);
        expect(isValidAt(rule({ id: 2 }), 0)).toBe(true);
        expect(validityInterval(rule({ id: 3, validFrom: 'garbage' }))).toEqual({});
    });
});

describe('assignCustomPlaces', () => {
    it('maps all canonical places inside a custom place to its most visited one', () => {
        const assignments = assignCustomPlaces(
            [
                { id: 'flat', ...north(5), visitCount: 300 },
                { id: 'bakery', ...north(20), visitCount: 4 },
                { id: 'far', ...north(800), visitCount: 900 },
            ],
            [rule({ id: 1, role: CustomPlaceRoleEnum.HOME })],
        );

        expect([...assignments.entries()].map(([id, a]) => [id, a.representativeId, a.customPlace.id])).toEqual([
            ['flat', 'flat', 1],
            ['bakery', 'flat', 1],
        ]);
    });
});

describe('classifyRoleVisits', () => {
    const home = rule({ id: 1, role: CustomPlaceRoleEnum.HOME, validFrom: '2020-02-01' });
    const other = rule({ id: 2, role: CustomPlaceRoleEnum.OTHER, ...north(1000) });
    const assignments = assignCustomPlaces(
        [
            { id: 'flat', ...north(0), visitCount: 10 },
            { id: 'bakery', ...north(30), visitCount: 2 },
            { id: 'friends', ...north(1000), visitCount: 5 },
        ],
        [home, other],
    );

    it('lets the custom role win over semanticType while the custom place is valid', () => {
        const result = classifyRoleVisits(
            [
                // before validFrom: Google decides
                ...nights('bakery', [0], 'WORK'),
                // valid: custom home, whatever Google said, counted for the representative
                ...nights('bakery', [40], 'WORK'),
                ...nights('flat', [41], null),
                ...nights('flat', [42], 'INFERRED_HOME'),
                // custom "other" cancels Google's home
                ...nights('friends', [43], 'HOME'),
                // elsewhere unchanged
                ...nights('office', [44], 'INFERRED_WORK'),
                ...nights('cafe', [45], 'UNKNOWN'),
            ],
            assignments,
        );

        expect(result.visits.HOME.map((visit) => [visit.placeId, day(visit.start), visit.inferred])).toEqual([
            ['flat', 40, false],
            ['flat', 41, false],
            ['flat', 42, false],
        ]);
        expect(result.visits.WORK.map((visit) => [visit.placeId, day(visit.start), visit.inferred])).toEqual([
            ['bakery', 0, false],
            ['office', 44, true],
        ]);
        expect(result.customVisitCount).toEqual({ HOME: 3, WORK: 0 });
        expect(result.overriddenVisitCount).toBe(2);
    });
});

describe('deriveRoleTimeline', () => {
    function visits(placeId: string, days: number[]): RoleVisit[] {
        return nights(placeId, days).map((row) => ({ ...row, inferred: false }));
    }

    it('writes the validity of a custom home as authoritative period even with sparse visits', () => {
        const home = rule({ id: 1, role: CustomPlaceRoleEnum.HOME, validFrom: '2020-03-01', validTo: '2020-12-31' });
        const assignments = assignCustomPlaces([{ id: 'flat', ...north(0), visitCount: 2 }], [home]);
        const result = deriveRoleTimeline(
            'HOME',
            [...visits('old', range(0, 59)), ...visits('flat', [100, 300]), ...visits('hotel', range(150, 155))],
            [home],
            assignments,
            options,
            T0 + 1000 * DAY,
        );

        expect(result.periods.map((p) => [p.placeId, day(p.from), day(p.to), p.visitCount, p.source])).toEqual([
            ['old', 0, 60, 60, 'visits'],
            ['flat', 60, 366, 2, 'custom-period'],
        ]);
        expect(result.periods[1]!.customPlaceId).toBe(1);
        // the hotel nights fall into the custom period and are dropped
        expect(result.ignoredVisitCount).toBe(0);
    });

    it('cuts and splits periods derived from visits around authoritative ones', () => {
        const home = rule({ id: 1, role: CustomPlaceRoleEnum.HOME, validFrom: '2020-02-10', validTo: '2020-02-19' });
        const assignments = assignCustomPlaces([{ id: 'flat', ...north(0), visitCount: 2 }], [home]);
        const result = deriveRoleTimeline(
            'HOME',
            visits('parents', range(0, 80)),
            [home],
            assignments,
            options,
            T0 + 1000 * DAY,
        );

        expect(result.periods.map((p) => [p.placeId, day(p.from), day(p.to), p.visitCount, p.source])).toEqual([
            ['parents', 0, 40, 40, 'visits'],
            ['flat', 40, 50, 0, 'custom-period'],
            ['parents', 50, 81, 31, 'visits'],
        ]);
    });

    it('runs an open-ended custom period until now and reports unmatched custom places', () => {
        const home = rule({ id: 1, role: CustomPlaceRoleEnum.HOME, validFrom: '2020-01-11' });
        const nowhere = rule({ id: 2, role: CustomPlaceRoleEnum.HOME, validFrom: '2020-01-01', ...north(5000) });
        const work = rule({ id: 3, role: CustomPlaceRoleEnum.WORK, validFrom: '2020-01-01', ...north(10) });
        const assignments = assignCustomPlaces([{ id: 'flat', ...north(0), visitCount: 2 }], [home, nowhere]);
        const result = deriveRoleTimeline(
            'HOME',
            visits('flat', [10, 12]),
            [home, nowhere, work],
            assignments,
            options,
            T0 + 20 * DAY,
        );

        // both visits fall into the custom period, which lasts until now
        expect(result.periods.map((p) => [p.placeId, day(p.from), day(p.to), p.visitCount, p.source])).toEqual([
            ['flat', 10, 20, 2, 'custom-period'],
        ]);
        expect(result.unmatchedCustomPlaceIds).toEqual([2]);
    });

    it('marks visit periods at a custom place without validity with its id', () => {
        const home = rule({ id: 4, role: CustomPlaceRoleEnum.HOME });
        const assignments = assignCustomPlaces([{ id: 'flat', ...north(0), visitCount: 3 }], [home]);
        const result = deriveRoleTimeline('HOME', visits('flat', [1, 2, 3]), [home], assignments, options, T0);

        expect(result.periods).toHaveLength(1);
        expect(result.periods[0]).toMatchObject({ placeId: 'flat', source: 'visits', customPlaceId: 4, visitCount: 3 });
    });
});
