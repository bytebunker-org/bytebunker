import { describe, expect, it } from 'vitest';
import {
    deriveRolePeriods,
    parseGraphTime,
    roleOfSemanticType,
    type RolePeriod,
    type RoleVisit,
} from './role-periods.util.js';

const options = { maxGapDays: 60, minTakeoverVisits: 3 };
const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2020, 0, 1);

/** Nightly visits at `placeId` on the given days (relative to 2020-01-01). */
function nights(placeId: string, days: number[], inferred = false): RoleVisit[] {
    return days.map((day) => ({
        placeId,
        start: T0 + day * DAY + 20 * 3_600_000,
        end: T0 + (day + 1) * DAY + 7 * 3_600_000,
        inferred,
    }));
}

function range(from: number, to: number, step = 1): number[] {
    return Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, index) => from + index * step);
}

function summary(periods: RolePeriod[]): [string, number, number, number][] {
    return periods.map((period) => [
        period.placeId,
        Math.floor((period.from - T0) / DAY),
        Math.floor((period.to - T0) / DAY),
        period.visitCount,
    ]);
}

describe('roleOfSemanticType', () => {
    it('maps the Google semantic types', () => {
        expect(roleOfSemanticType('HOME')).toEqual({ role: 'HOME', inferred: false });
        expect(roleOfSemanticType('INFERRED_HOME')).toEqual({ role: 'HOME', inferred: true });
        expect(roleOfSemanticType('WORK')).toEqual({ role: 'WORK', inferred: false });
        expect(roleOfSemanticType('INFERRED_WORK')).toEqual({ role: 'WORK', inferred: true });
        expect(roleOfSemanticType('ALIASED_LOCATION')).toBeUndefined();
        expect(roleOfSemanticType(undefined)).toBeUndefined();
    });
});

describe('deriveRolePeriods', () => {
    it('returns nothing for no visits', () => {
        expect(deriveRolePeriods([], options)).toEqual({ periods: [], ignoredVisitCount: 0 });
    });

    it('merges visits with gaps below the threshold into one period, regardless of input order', () => {
        const visits = nights('A', [0, 10, 50, 100, 150]).reverse();
        const { periods } = deriveRolePeriods(visits, options);

        expect(summary(periods)).toEqual([['A', 0, 151, 5]]);
    });

    it('splits a period at a gap of the threshold or longer', () => {
        const { periods } = deriveRolePeriods(nights('A', [0, 5, 80, 90]), options);

        expect(summary(periods)).toEqual([
            ['A', 0, 6, 2],
            ['A', 80, 91, 2],
        ]);
    });

    it('switches to a new home once it has enough visits in a row', () => {
        const visits = [...nights('A', range(0, 99)), ...nights('B', range(100, 199))];
        const { periods, ignoredVisitCount } = deriveRolePeriods(visits, options);

        expect(summary(periods)).toEqual([
            ['A', 0, 100, 100],
            ['B', 100, 200, 100],
        ]);
        expect(ignoredVisitCount).toBe(0);
    });

    it('ignores short detours to another place (holidays, a night at friends)', () => {
        const visits = [...nights('A', [...range(0, 20), ...range(23, 40)]), ...nights('B', [21, 22])];
        const { periods, ignoredVisitCount } = deriveRolePeriods(visits, options);

        expect(summary(periods)).toEqual([['A', 0, 41, 39]]);
        expect(ignoredVisitCount).toBe(2);
    });

    it('needs the visits of the new place to be consecutive to take over', () => {
        // Alternating A, B, A, B: B never gets three in a row.
        const visits = range(0, 30).flatMap((day) => nights(day % 2 ? 'B' : 'A', [day]));
        const { periods, ignoredVisitCount } = deriveRolePeriods(visits, options);

        expect(summary(periods)).toEqual([['A', 0, 31, 16]]);
        expect(ignoredVisitCount).toBe(15);
    });

    it('lets a moving phase with a few visits back at the old place end in the new place', () => {
        const visits = [
            ...nights('A', range(0, 50)),
            ...nights('B', [51, 52]),
            ...nights('A', [53]),
            ...nights('B', range(54, 90)),
        ];
        const { periods, ignoredVisitCount } = deriveRolePeriods(visits, options);

        expect(summary(periods)).toEqual([
            ['A', 0, 54, 52],
            ['B', 54, 91, 37],
        ]);
        expect(ignoredVisitCount).toBe(2);
    });

    it('starts a new period at another place directly after a long gap', () => {
        const visits = [...nights('A', range(0, 10)), ...nights('B', [200])];
        const { periods } = deriveRolePeriods(visits, options);

        expect(summary(periods)).toEqual([
            ['A', 0, 11, 11],
            ['B', 200, 201, 1],
        ]);
    });

    it('lets a detour that resumes after the old place went quiet become the new period', () => {
        // A ends on day 10; B visited on days 30 and 31 (too few to take over) and again on day 75.
        const visits = [...nights('A', range(0, 10)), ...nights('B', [30, 31, 75])];
        const { periods } = deriveRolePeriods(visits, options);

        expect(summary(periods)).toEqual([
            ['A', 0, 11, 11],
            ['B', 30, 76, 3],
        ]);
    });

    it('drops a stale detour instead of stretching the next period back to it', () => {
        // A keeps going; B seen twice on day 5 and 6, then again on day 100 after A went quiet on day 30.
        const visits = [...nights('A', [...range(0, 4), ...range(7, 30)]), ...nights('B', [5, 6, 100])];
        const { periods, ignoredVisitCount } = deriveRolePeriods(visits, options);

        expect(summary(periods)).toEqual([
            ['A', 0, 31, 29],
            ['B', 100, 101, 1],
        ]);
        expect(ignoredVisitCount).toBe(2);
    });

    it('marks a period inferred only if every visit was inferred', () => {
        const inferredOnly = deriveRolePeriods(nights('A', [0, 1], true), options).periods[0]!;
        const mixed = deriveRolePeriods([...nights('A', [0], true), ...nights('A', [1])], options).periods[0]!;

        expect(inferredOnly).toMatchObject({ inferred: true, inferredVisitCount: 2 });
        expect(mixed).toMatchObject({ inferred: false, inferredVisitCount: 1 });
    });

    it('treats a missing end as a point in time', () => {
        const { periods } = deriveRolePeriods([{ placeId: 'A', start: T0, end: Number.NaN, inferred: false }], options);

        expect(periods[0]).toMatchObject({ from: T0, to: T0 });
    });
});

describe('parseGraphTime', () => {
    it('parses ISO strings, JSON-quoted ISO strings and rejects garbage', () => {
        expect(parseGraphTime('2020-01-01T00:00:00.000Z')).toBe(T0);
        expect(parseGraphTime('"2020-01-01T00:00:00.000Z"')).toBe(T0);
        expect(parseGraphTime({ toString: () => '2020-01-01T00:00:00Z' })).toBe(T0);
        expect(parseGraphTime('nope')).toBeUndefined();
        expect(parseGraphTime(null)).toBeUndefined();
    });
});
