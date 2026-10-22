export type PlaceRole = 'HOME' | 'WORK';

const SEMANTIC_TYPE_ROLES: Record<string, { role: PlaceRole; inferred: boolean }> = {
    HOME: { role: 'HOME', inferred: false },
    INFERRED_HOME: { role: 'HOME', inferred: true },
    WORK: { role: 'WORK', inferred: false },
    INFERRED_WORK: { role: 'WORK', inferred: true },
};

export const ROLE_SEMANTIC_TYPES = Object.keys(SEMANTIC_TYPE_ROLES);

const DAY_MS = 24 * 60 * 60 * 1000;

/** Maps a Google Timeline visit `semanticType` to the role it marks, if any. */
export function roleOfSemanticType(semanticType: unknown): { role: PlaceRole; inferred: boolean } | undefined {
    return typeof semanticType === 'string' ? SEMANTIC_TYPE_ROLES[semanticType] : undefined;
}

export interface RoleVisit {
    placeId: string;
    /** Epoch milliseconds. */
    start: number;
    end: number;
    inferred: boolean;
}

export interface RolePeriod {
    placeId: string;
    /** Start of the first visit, epoch milliseconds. */
    from: number;
    /** End of the last visit, epoch milliseconds. */
    to: number;
    visitCount: number;
    inferredVisitCount: number;
    /** Every visit of the period was only inferred by Google. */
    inferred: boolean;
}

export interface RolePeriodOptions {
    /** A place stops being the home (work place) after this long without a visit. */
    maxGapDays: number;
    /** Consecutive visits another place needs before it takes over; fewer are treated as a temporary stay. */
    minTakeoverVisits: number;
}

export interface RolePeriodResult {
    periods: RolePeriod[];
    /** Visits at other places too few to take over (holidays, staying at friends'), not part of any period. */
    ignoredVisitCount: number;
}

interface Run {
    placeId: string;
    visits: RoleVisit[];
    lastEnd: number;
}

/**
 * Turns the visits marked with one role into non-overlapping periods, walking them in time order:
 * - a period extends while its place keeps being visited with gaps shorter than `maxGapDays`;
 * - a longer gap ends the period, and the next visit starts a new one (at the same or another place);
 * - visits at another place only end the period once that place collected `minTakeoverVisits` visits in a row
 *   (no visit at the current place in between); it then takes over. Shorter detours are ignored.
 */
export function deriveRolePeriods(visits: RoleVisit[], options: RolePeriodOptions): RolePeriodResult {
    const maxGapMs = options.maxGapDays * DAY_MS;
    const minTakeoverVisits = Math.max(1, options.minTakeoverVisits);
    const sorted = visits
        .filter((visit) => Number.isFinite(visit.start))
        .map((visit) => ({
            ...visit,
            end: Number.isFinite(visit.end) ? Math.max(visit.end, visit.start) : visit.start,
        }))
        .sort((a, b) => a.start - b.start || a.end - b.end);

    const periods: RolePeriod[] = [];
    let ignoredVisitCount = 0;
    let current: Run | undefined;
    let pending: Run | undefined;

    const startRun = (visit: RoleVisit): Run => ({ placeId: visit.placeId, visits: [visit], lastEnd: visit.end });
    const addToRun = (run: Run, visit: RoleVisit): void => {
        run.visits.push(visit);
        run.lastEnd = Math.max(run.lastEnd, visit.end);
    };
    const dropPending = (): void => {
        ignoredVisitCount += pending?.visits.length ?? 0;
        pending = undefined;
    };
    const closeCurrent = (): void => {
        if (current) {
            periods.push(toPeriod(current));
            current = undefined;
        }
    };

    for (const visit of sorted) {
        if (!current) {
            current = startRun(visit);
            continue;
        }

        // A detour that went quiet for longer than the gap cannot take over any more.
        if (pending && visit.start - pending.lastEnd >= maxGapMs) {
            dropPending();
        }

        if (visit.start - current.lastEnd >= maxGapMs) {
            closeCurrent();

            if (pending?.placeId === visit.placeId) {
                addToRun(pending, visit);
                current = pending;
                pending = undefined;
            } else {
                dropPending();
                current = startRun(visit);
            }

            continue;
        }

        if (visit.placeId === current.placeId) {
            addToRun(current, visit);
            dropPending();
            continue;
        }

        if (pending?.placeId === visit.placeId) {
            addToRun(pending, visit);
        } else {
            dropPending();
            pending = startRun(visit);
        }

        if (pending!.visits.length >= minTakeoverVisits) {
            closeCurrent();
            current = pending;
            pending = undefined;
        }
    }

    closeCurrent();
    dropPending();

    return { periods, ignoredVisitCount };
}

function toPeriod(run: Run): RolePeriod {
    const inferredVisitCount = run.visits.filter((visit) => visit.inferred).length;

    return {
        placeId: run.placeId,
        from: run.visits[0]!.start,
        to: run.lastEnd,
        visitCount: run.visits.length,
        inferredVisitCount,
        inferred: inferredVisitCount === run.visits.length,
    };
}

/**
 * Activity times are stored as ISO strings; tolerate JSON-quoted strings and Neo4j temporal values as well.
 * Returns epoch milliseconds or undefined.
 */
export function parseGraphTime(value: unknown): number | undefined {
    if (value === null || value === undefined) {
        return undefined;
    }

    const text = (typeof value === 'string' ? value : String(value)).trim().replace(/^"(.*)"$/, '$1');
    const millis = Date.parse(text);

    return Number.isNaN(millis) ? undefined : millis;
}
