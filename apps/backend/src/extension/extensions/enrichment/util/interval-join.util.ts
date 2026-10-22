/** A closed time interval in epoch milliseconds; `end === start` is a point in time. */
export interface TimeInterval {
    start: number;
    end: number;
}

export interface IntervalPair<L, R> {
    left: L;
    right: R;
    /** Length of the intersection; 0 when the intervals only touch or one of them is a point. */
    overlapMs: number;
}

interface SweepItem<T> {
    item: T;
    start: number;
    end: number;
    side: 0 | 1;
}

/**
 * All pairs of a left and a right interval that intersect (closed intervals: touching counts, overlap 0).
 *
 * A sweep over both lists sorted by start: when an interval starts it is paired with the still-active intervals of the
 * other side (those started earlier and not ended before it). Runs in O((n + m) log(n + m) + pairs + active), so it
 * stays linear for mostly disjoint intervals (moves, listens) instead of comparing every pair. Invalid intervals
 * (non-finite start) are skipped; a missing or earlier end is treated as a point at `start`.
 */
export function joinOverlappingIntervals<L extends TimeInterval, R extends TimeInterval>(
    left: L[],
    right: R[],
): IntervalPair<L, R>[] {
    const items: SweepItem<L | R>[] = [];
    const push = (item: L | R, side: 0 | 1) => {
        if (!Number.isFinite(item.start)) {
            return;
        }

        items.push({
            item,
            start: item.start,
            end: Number.isFinite(item.end) ? Math.max(item.end, item.start) : item.start,
            side,
        });
    };

    for (const item of left) push(item, 0);
    for (const item of right) push(item, 1);
    items.sort((a, b) => a.start - b.start || a.side - b.side);

    const active: [SweepItem<L | R>[], SweepItem<L | R>[]] = [[], []];
    const pairs: IntervalPair<L, R>[] = [];

    for (const current of items) {
        const other = 1 - current.side;
        // Everything on the other side that ended before this start can never overlap a later interval either.
        const stillActive = active[other]!.filter((candidate) => candidate.end >= current.start);
        active[other] = stillActive;

        for (const candidate of stillActive) {
            const overlapMs = Math.max(0, Math.min(candidate.end, current.end) - current.start);
            const [l, r] = current.side === 0 ? [current, candidate] : [candidate, current];

            pairs.push({ left: l.item as L, right: r.item as R, overlapMs });
        }

        active[current.side]!.push(current);
    }

    return pairs;
}
