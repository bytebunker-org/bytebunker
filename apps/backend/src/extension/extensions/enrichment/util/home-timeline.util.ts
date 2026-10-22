import { haversineMeters, type LatLng } from './geo.util.js';

/** A HOME_DURING period of the owner with the coordinates of the place. Times in epoch milliseconds. */
export interface HomePeriod extends LatLng {
    placeId: string;
    from: number;
    to: number;
}

const HOUR_MS = 60 * 60 * 1000;

/**
 * Answers "where was home at time t" from the derived home periods. Between two periods (moving house, long stays
 * away without any home visit) the nearer period applies if it is at most `maxGapDays` away, so a trip that ends one
 * period and starts the next is still measured against a home.
 */
export class HomeTimeline {
    private readonly periods: HomePeriod[];
    private readonly maxGapMs: number;

    constructor(periods: HomePeriod[], options: { maxGapDays: number }) {
        this.periods = periods
            .filter((period) => Number.isFinite(period.from) && Number.isFinite(period.to))
            .sort((a, b) => a.from - b.from);
        this.maxGapMs = options.maxGapDays * 24 * HOUR_MS;
    }

    public get size(): number {
        return this.periods.length;
    }

    public homeAt(time: number): HomePeriod | undefined {
        // Last period that started at or before `time`.
        let low = 0;
        let high = this.periods.length - 1;
        let index = -1;

        while (low <= high) {
            const middle = (low + high) >> 1;

            if (this.periods[middle]!.from <= time) {
                index = middle;
                low = middle + 1;
            } else {
                high = middle - 1;
            }
        }

        const before = index >= 0 ? this.periods[index] : undefined;

        if (before && time <= before.to) {
            return before;
        }

        const after = this.periods[index + 1];
        const gapBefore = before ? time - before.to : Infinity;
        const gapAfter = after ? after.from - time : Infinity;
        const [nearest, gap] = gapBefore <= gapAfter ? [before, gapBefore] : [after, gapAfter];

        return nearest && gap <= this.maxGapMs ? nearest : undefined;
    }

    /** Distance in km from the home active at `time`, or undefined if no home is known then. */
    public distanceFromHomeKm(time: number, point: LatLng): { home: HomePeriod; distanceKm: number } | undefined {
        const home = this.homeAt(time);

        return home ? { home, distanceKm: haversineMeters(home, point) / 1000 } : undefined;
    }
}
