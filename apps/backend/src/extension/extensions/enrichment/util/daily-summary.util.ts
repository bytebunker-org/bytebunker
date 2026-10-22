import { DateTime } from 'luxon';

const MINUTE_MS = 60_000;
/** Day keys are cached per quarter hour: every UTC offset in use is a multiple of 15 minutes. */
const DAY_KEY_BUCKET_MS = 15 * MINUTE_MS;
/** An arrive spanning more days than this (a broken end time) only counts for its first days. */
const MAX_ARRIVE_DAYS = 31;
/** Longer listening durations are data errors (a player left paused); they count as this. */
const MAX_LISTEN_MS = 4 * 60 * MINUTE_MS;
/** At most this many place ids are stored per day. */
const MAX_PLACE_IDS = 100;

export interface DailySummaryRow {
    id: string;
    date: string;
    timezone: string;
    /** Start and end of the local day as UTC ISO timestamps. */
    startTime: string;
    endTime: string;
    activityCount: number;
    arriveCount: number;
    moveCount: number;
    listenCount: number;
    viewCount: number;
    eventCount: number;
    placeCount: number;
    placeIds: string[];
    moveDistanceKm: number;
    /** Parallel lists, longest distance first. */
    moveModes: string[];
    moveModeKm: number[];
    moveModeCounts: number[];
    listeningMinutes: number;
    /** Listens whose source has no duration (YouTube Music); not part of `listeningMinutes`. */
    listensWithoutDuration: number;
    onTrip: boolean;
    travelIds: string[];
    /** Arrives, moves and events of the day (only collected when linking is enabled). */
    activityIds: string[];
}

interface DayAccumulator {
    date: string;
    arriveCount: number;
    moveCount: number;
    listenCount: number;
    viewCount: number;
    eventCount: number;
    placeIds: Set<string>;
    modes: Map<string, { km: number; count: number }>;
    listeningMs: number;
    listensWithoutDuration: number;
    travelIds: Set<string>;
    activityIds: string[];
}

export function dailySummaryId(date: string): string {
    return `daily-summary:${date}`;
}

/**
 * Folds activities into one summary per local day, so activities can be read in batches and never all held at
 * once. Everything counts on the day it started, except arrives, whose place counts on every day they cover.
 */
export class DailySummaryAccumulator {
    private readonly days = new Map<string, DayAccumulator>();
    private readonly dayKeyCache = new Map<number, string>();

    constructor(
        public readonly timezone: string,
        private readonly options: { collectActivityIds: boolean } = { collectActivityIds: false },
    ) {
        if (!DateTime.local().setZone(timezone).isValid) {
            throw new Error(`Unknown timezone "${timezone}"`);
        }
    }

    public get dayCount(): number {
        return this.days.size;
    }

    public addArrive(arrive: { id: string; start: number; end?: number; placeId?: string; topLevel: boolean }): void {
        const day = this.dayAt(arrive.start);

        if (!day) {
            return;
        }

        day.arriveCount++;
        this.collect(day, arrive.id);

        if (!arrive.placeId || !arrive.topLevel) {
            return;
        }

        day.placeIds.add(arrive.placeId);

        const end = arrive.end !== undefined && Number.isFinite(arrive.end) ? arrive.end : arrive.start;
        let cursor = DateTime.fromMillis(arrive.start, { zone: this.timezone }).startOf('day').plus({ days: 1 });

        for (let index = 1; index < MAX_ARRIVE_DAYS && cursor.toMillis() < end; index++) {
            this.dayAt(cursor.toMillis())?.placeIds.add(arrive.placeId);
            cursor = cursor.plus({ days: 1 });
        }
    }

    public addMove(move: { id: string; start: number; mode: string; distanceKm?: number }): void {
        const day = this.dayAt(move.start);

        if (!day) {
            return;
        }

        day.moveCount++;
        this.collect(day, move.id);

        const mode = day.modes.get(move.mode) ?? { km: 0, count: 0 };
        mode.count++;
        mode.km += move.distanceKm ?? 0;
        day.modes.set(move.mode, mode);
    }

    public addListen(listen: { start: number; end?: number; msPlayed?: number }): void {
        const day = this.dayAt(listen.start);

        if (!day) {
            return;
        }

        day.listenCount++;

        const durationMs =
            listen.end !== undefined && listen.end > listen.start
                ? listen.end - listen.start
                : listen.msPlayed !== undefined && listen.msPlayed > 0
                  ? listen.msPlayed
                  : undefined;

        if (durationMs === undefined) {
            day.listensWithoutDuration++;
        } else {
            day.listeningMs += Math.min(durationMs, MAX_LISTEN_MS);
        }
    }

    public addView(view: { start: number }): void {
        const day = this.dayAt(view.start);

        if (day) {
            day.viewCount++;
        }
    }

    public addEvent(event: { id: string; start: number }): void {
        const day = this.dayAt(event.start);

        if (day) {
            day.eventCount++;
            this.collect(day, event.id);
        }
    }

    /** Marks the days a trip covers (only days that have activities anyway). */
    public addTravel(travel: { id: string; start: number; end: number }): void {
        let cursor = DateTime.fromMillis(travel.start, { zone: this.timezone }).startOf('day');

        while (cursor.isValid && cursor.toMillis() < travel.end) {
            this.days.get(cursor.toISODate()!)?.travelIds.add(travel.id);
            cursor = cursor.plus({ days: 1 });
        }
    }

    public build(): DailySummaryRow[] {
        return [...this.days.values()]
            .sort((a, b) => a.date.localeCompare(b.date))
            .map((day) => {
                const dayStart = DateTime.fromISO(day.date, { zone: this.timezone }).startOf('day');
                const modes = [...day.modes.entries()].sort(
                    ([modeA, a], [modeB, b]) => b.km - a.km || b.count - a.count || modeA.localeCompare(modeB),
                );
                const placeIds = [...day.placeIds].sort();

                return {
                    id: dailySummaryId(day.date),
                    date: day.date,
                    timezone: this.timezone,
                    startTime: dayStart.toUTC().toISO()!,
                    endTime: dayStart.plus({ days: 1 }).toUTC().toISO()!,
                    activityCount: day.arriveCount + day.moveCount + day.listenCount + day.viewCount + day.eventCount,
                    arriveCount: day.arriveCount,
                    moveCount: day.moveCount,
                    listenCount: day.listenCount,
                    viewCount: day.viewCount,
                    eventCount: day.eventCount,
                    placeCount: placeIds.length,
                    placeIds: placeIds.slice(0, MAX_PLACE_IDS),
                    moveDistanceKm: round1(modes.reduce((sum, [, mode]) => sum + mode.km, 0)),
                    moveModes: modes.map(([mode]) => mode),
                    moveModeKm: modes.map(([, mode]) => round1(mode.km)),
                    moveModeCounts: modes.map(([, mode]) => mode.count),
                    listeningMinutes: round1(day.listeningMs / MINUTE_MS),
                    listensWithoutDuration: day.listensWithoutDuration,
                    onTrip: day.travelIds.size > 0,
                    travelIds: [...day.travelIds].sort(),
                    activityIds: day.activityIds,
                };
            });
    }

    private collect(day: DayAccumulator, id: string): void {
        if (this.options.collectActivityIds) {
            day.activityIds.push(id);
        }
    }

    /** The day containing `time`, created on first use. */
    private dayAt(time: number): DayAccumulator | undefined {
        if (!Number.isFinite(time)) {
            return undefined;
        }

        const bucket = Math.floor(time / DAY_KEY_BUCKET_MS);
        let date = this.dayKeyCache.get(bucket);

        if (date === undefined) {
            date = DateTime.fromMillis(time, { zone: this.timezone }).toISODate() ?? '';
            this.dayKeyCache.set(bucket, date);
        }

        if (!date) {
            return undefined;
        }

        let day = this.days.get(date);

        if (!day) {
            day = {
                date,
                arriveCount: 0,
                moveCount: 0,
                listenCount: 0,
                viewCount: 0,
                eventCount: 0,
                placeIds: new Set(),
                modes: new Map(),
                listeningMs: 0,
                listensWithoutDuration: 0,
                travelIds: new Set(),
                activityIds: [],
            };
            this.days.set(date, day);
        }

        return day;
    }
}

function round1(value: number): number {
    return Math.round(value * 10) / 10;
}
