import { describe, expect, it } from 'vitest';
import { joinOverlappingIntervals, type TimeInterval } from './interval-join.util.js';

interface Named extends TimeInterval {
    name: string;
}

const iv = (name: string, start: number, end: number = start): Named => ({ name, start, end });

function pairs(left: Named[], right: Named[]) {
    return joinOverlappingIntervals(left, right)
        .map(({ left: l, right: r, overlapMs }) => [l.name, r.name, overlapMs] as const)
        .sort(([a1, b1], [a2, b2]) => a1.localeCompare(a2) || b1.localeCompare(b2));
}

/** O(n·m) reference the sweep must agree with. */
function bruteForce(left: Named[], right: Named[]) {
    return left
        .flatMap((l) =>
            right
                .filter((r) => l.start <= r.end && r.start <= l.end)
                .map(
                    (r) => [l.name, r.name, Math.max(0, Math.min(l.end, r.end) - Math.max(l.start, r.start))] as const,
                ),
        )
        .sort(([a1, b1], [a2, b2]) => a1.localeCompare(a2) || b1.localeCompare(b2));
}

describe('joinOverlappingIntervals', () => {
    it('pairs overlapping intervals with their overlap', () => {
        expect(pairs([iv('a', 0, 10), iv('b', 20, 30)], [iv('x', 5, 25), iv('y', 31, 40)])).toEqual([
            ['a', 'x', 5],
            ['b', 'x', 5],
        ]);
    });

    it('counts touching intervals and points inside intervals with overlap 0', () => {
        expect(pairs([iv('a', 0, 10), iv('p', 5)], [iv('x', 10, 20), iv('y', 0, 6)])).toEqual([
            ['a', 'x', 0],
            ['a', 'y', 6],
            ['p', 'y', 0],
        ]);
    });

    it('handles a long interval spanning many short ones and equal starts', () => {
        const short = Array.from({ length: 5 }, (_, index) => iv(`s${index}`, index * 10, index * 10 + 5));

        expect(pairs([iv('long', 0, 100), iv('same', 0, 1)], short)).toEqual(
            bruteForce([iv('long', 0, 100), iv('same', 0, 1)], short),
        );
    });

    it('treats a missing or earlier end as a point and skips invalid starts', () => {
        expect(pairs([iv('a', 10, 5), iv('bad', Number.NaN, 5)], [iv('x', 0, 20)])).toEqual([['a', 'x', 0]]);
    });

    it('agrees with the brute-force join on random data', () => {
        let seed = 42;
        const random = () => {
            seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31;

            return seed / 2 ** 31;
        };
        const make = (prefix: string, count: number, maxLength: number) =>
            Array.from({ length: count }, (_, index) => {
                const start = Math.floor(random() * 1000);

                return iv(`${prefix}${index}`, start, start + Math.floor(random() * maxLength));
            });

        for (let round = 0; round < 20; round++) {
            const left = make('l', 40, 50);
            const right = make('r', 60, 10);

            expect(pairs(left, right)).toEqual(bruteForce(left, right));
        }
    });
});
