import { CustomPlaceRoleEnum } from '../custom-place/dto/custom-place-role.enum.js';
import { haversineMeters, type LatLng } from './geo.util.js';
import {
    deriveRolePeriods,
    type PlaceRole,
    type RolePeriod,
    type RolePeriodOptions,
    roleOfSemanticType,
    type RoleVisit,
} from './role-periods.util.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** A user-defined place as the enrichment modules use it (plain data, read once per pipeline run). */
export interface CustomPlaceRule {
    id: number;
    name: string;
    latitude: number;
    longitude: number;
    radiusMeters: number;
    role: CustomPlaceRoleEnum;
    /** First day the place had its role, `YYYY-MM-DD` (UTC), inclusive. */
    validFrom?: string;
    /** Last day the place had its role, `YYYY-MM-DD` (UTC), inclusive. */
    validTo?: string;
}

export interface CustomPlaceMatch {
    customPlace: CustomPlaceRule;
    distanceMeters: number;
}

/**
 * Properties the enrichment modules store on a `CanonicalPlace` matched by a custom place (`null` clears them when the
 * custom place was deleted or moved away). consolidate-places keeps them, like the geocoding properties.
 */
export const CUSTOM_PLACE_PROPERTY_KEYS = ['customPlaceId', 'customRole', 'customName'] as const;

/**
 * The custom place whose radius contains the point. If several do, the one the point is relatively closest to
 * (distance / radius) wins, so a small place inside a big one still gets its own name.
 */
export function matchCustomPlace(
    point: LatLng,
    customPlaces: readonly CustomPlaceRule[],
): CustomPlaceMatch | undefined {
    let best: (CustomPlaceMatch & { ratio: number }) | undefined;

    for (const customPlace of customPlaces) {
        if (!(customPlace.radiusMeters > 0)) {
            continue;
        }

        const distanceMeters = haversineMeters(point, customPlace);

        if (distanceMeters > customPlace.radiusMeters) {
            continue;
        }

        const ratio = distanceMeters / customPlace.radiusMeters;

        if (!best || ratio < best.ratio || (ratio === best.ratio && customPlace.id < best.customPlace.id)) {
            best = { customPlace, distanceMeters, ratio };
        }
    }

    return best ? { customPlace: best.customPlace, distanceMeters: best.distanceMeters } : undefined;
}

/** Matches every place against the custom places; places outside all radii are left out. */
export function matchCustomPlaces<P extends LatLng & { id: string }>(
    places: readonly P[],
    customPlaces: readonly CustomPlaceRule[],
): Map<string, CustomPlaceMatch> {
    const matches = new Map<string, CustomPlaceMatch>();

    if (!customPlaces.length) {
        return matches;
    }

    for (const place of places) {
        const match = matchCustomPlace(place, customPlaces);

        if (match) {
            matches.set(place.id, match);
        }
    }

    return matches;
}

/** The custom place properties of a canonical place; all `null` without a match. */
export function customPlaceProps(match: CustomPlaceMatch | undefined): Record<string, unknown> {
    return {
        customPlaceId: match?.customPlace.id ?? null,
        customRole: match?.customPlace.role ?? null,
        customName: match?.customPlace.name ?? null,
    };
}

/** `[from, to)` in epoch milliseconds; a missing bound is open. Invalid dates count as missing. */
export function validityInterval(rule: Pick<CustomPlaceRule, 'validFrom' | 'validTo'>): {
    from?: number;
    to?: number;
} {
    const from = parseDay(rule.validFrom);
    const to = parseDay(rule.validTo);

    return {
        ...(from === undefined ? {} : { from }),
        ...(to === undefined ? {} : { to: to + DAY_MS }),
    };
}

export function isValidAt(rule: Pick<CustomPlaceRule, 'validFrom' | 'validTo'>, time: number): boolean {
    const { from, to } = validityInterval(rule);

    return (from === undefined || time >= from) && (to === undefined || time < to);
}

function parseDay(day: string | undefined): number | undefined {
    if (!day || !/^\d{4}-\d{2}-\d{2}/.test(day)) {
        return undefined;
    }

    const millis = Date.parse(`${day.slice(0, 10)}T00:00:00Z`);

    return Number.isNaN(millis) ? undefined : millis;
}

export function roleOfCustomPlace(role: CustomPlaceRoleEnum): PlaceRole | undefined {
    return role === CustomPlaceRoleEnum.HOME ? 'HOME' : role === CustomPlaceRoleEnum.WORK ? 'WORK' : undefined;
}

export interface CustomPlaceCandidate extends LatLng {
    id: string;
    visitCount: number;
}

/** How a canonical place inside a custom place is treated by derive-home-work. */
export interface CustomPlaceAssignment {
    customPlace: CustomPlaceRule;
    /**
     * The canonical place that stands for the custom place: home/work periods point at it, so several canonical
     * places inside one custom place count as one place. The most visited one.
     */
    representativeId: string;
}

/** Assigns the canonical places inside custom places to them, keyed by canonical place id. */
export function assignCustomPlaces(
    places: readonly CustomPlaceCandidate[],
    customPlaces: readonly CustomPlaceRule[],
): Map<string, CustomPlaceAssignment> {
    const matches = matchCustomPlaces(places, customPlaces);
    const byCustomPlace = new Map<number, { place: CustomPlaceCandidate; match: CustomPlaceMatch }[]>();

    for (const place of places) {
        const match = matches.get(place.id);

        if (match) {
            const group = byCustomPlace.get(match.customPlace.id) ?? [];
            group.push({ place, match });
            byCustomPlace.set(match.customPlace.id, group);
        }
    }

    const assignments = new Map<string, CustomPlaceAssignment>();

    for (const group of byCustomPlace.values()) {
        const representative = [...group].sort(
            (a, b) =>
                b.place.visitCount - a.place.visitCount ||
                a.match.distanceMeters - b.match.distanceMeters ||
                (a.place.id < b.place.id ? -1 : a.place.id > b.place.id ? 1 : 0),
        )[0]!;

        for (const { place, match } of group) {
            assignments.set(place.id, {
                customPlace: match.customPlace,
                representativeId: representative.place.id,
            });
        }
    }

    return assignments;
}

export interface ArriveVisitRow {
    placeId: string;
    /** Epoch milliseconds. */
    start: number;
    end: number;
    semanticType?: string | null;
}

export interface ClassifiedRoleVisits {
    visits: Record<PlaceRole, RoleVisit[]>;
    /** Visits whose role came from a custom place, per role. */
    customVisitCount: Record<PlaceRole, number>;
    /** Visits Google marked home/work that a custom place of another role (or `other`) overrode. */
    overriddenVisitCount: number;
}

/**
 * Picks the role of every arrive visit: at a place inside a custom home/work place (while the custom place is valid)
 * the custom role wins over Google's `semanticType`, and the visit counts for the custom place's representative.
 * A custom `other` place cancels Google's home/work there. Elsewhere `semanticType` decides as before.
 */
export function classifyRoleVisits(
    rows: readonly ArriveVisitRow[],
    assignments: ReadonlyMap<string, CustomPlaceAssignment>,
): ClassifiedRoleVisits {
    const result: ClassifiedRoleVisits = {
        visits: { HOME: [], WORK: [] },
        customVisitCount: { HOME: 0, WORK: 0 },
        overriddenVisitCount: 0,
    };

    for (const row of rows) {
        if (!Number.isFinite(row.start)) {
            continue;
        }

        const end = Number.isFinite(row.end) ? Math.max(row.end, row.start) : row.start;
        const semantic = roleOfSemanticType(row.semanticType);
        const assignment = assignments.get(row.placeId);

        if (assignment && isValidAt(assignment.customPlace, row.start)) {
            const role = roleOfCustomPlace(assignment.customPlace.role);

            if (semantic && semantic.role !== role) {
                result.overriddenVisitCount++;
            }

            if (role) {
                result.visits[role].push({
                    placeId: assignment.representativeId,
                    start: row.start,
                    end,
                    inferred: false,
                });
                result.customVisitCount[role]++;
            }

            continue;
        }

        if (semantic) {
            result.visits[semantic.role].push({
                placeId: row.placeId,
                start: row.start,
                end,
                inferred: semantic.inferred,
            });
        }
    }

    return result;
}

export type RolePeriodSource = 'custom-period' | 'visits';

export interface RoleTimelinePeriod extends RolePeriod {
    /** `custom-period`: the validity of a custom place (authoritative); `visits`: derived from visits. */
    source: RolePeriodSource;
    /** Set when the period's place is a custom place (also for periods derived from visits there). */
    customPlaceId?: number;
}

export interface RoleTimelineResult {
    periods: RoleTimelinePeriod[];
    ignoredVisitCount: number;
    /** Custom home/work places with a validity that no canonical place lies in (no edge can be written). */
    unmatchedCustomPlaceIds: number[];
}

/**
 * The home (or work) timeline: custom places of the role that have validFrom/validTo give authoritative periods
 * (written even if visits are sparse); the visits outside those periods give the other periods as before
 * ({@link deriveRolePeriods}), cut where they would overlap an authoritative period.
 *
 * An authoritative period without validTo lasts until `now`; one without validFrom starts at the first visit there.
 */
export function deriveRoleTimeline(
    role: PlaceRole,
    visits: readonly RoleVisit[],
    customPlaces: readonly CustomPlaceRule[],
    assignments: ReadonlyMap<string, CustomPlaceAssignment>,
    options: RolePeriodOptions,
    now: number,
): RoleTimelineResult {
    const representatives = new Map<number, string>();

    for (const assignment of assignments.values()) {
        representatives.set(assignment.customPlace.id, assignment.representativeId);
    }

    const customPlaceOfRepresentative = new Map<string, number>();

    for (const [customPlaceId, representativeId] of representatives) {
        customPlaceOfRepresentative.set(representativeId, customPlaceId);
    }

    const authoritative: RoleTimelinePeriod[] = [];
    const unmatchedCustomPlaceIds: number[] = [];

    for (const customPlace of customPlaces) {
        if (roleOfCustomPlace(customPlace.role) !== role || (!customPlace.validFrom && !customPlace.validTo)) {
            continue;
        }

        const placeId = representatives.get(customPlace.id);

        if (!placeId) {
            unmatchedCustomPlaceIds.push(customPlace.id);
            continue;
        }

        const validity = validityInterval(customPlace);
        const visitsHere = visits.filter((visit) => visit.placeId === placeId && isValidAt(customPlace, visit.start));
        const from = validity.from ?? Math.min(...visitsHere.map((visit) => visit.start));
        const to = validity.to ?? Math.max(now, ...visitsHere.map((visit) => visit.end));

        if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) {
            continue;
        }

        authoritative.push({
            placeId,
            from,
            to,
            visitCount: visitsHere.length,
            inferredVisitCount: 0,
            inferred: false,
            source: 'custom-period',
            customPlaceId: customPlace.id,
        });
    }

    authoritative.sort((a, b) => a.from - b.from || a.to - b.to);

    const inAuthoritative = (time: number) => authoritative.some((period) => time >= period.from && time < period.to);
    const remaining = visits.filter((visit) => !inAuthoritative(visit.start));
    const derived = deriveRolePeriods(remaining, options);
    const pieces: RoleTimelinePeriod[] = [];

    for (const period of derived.periods) {
        const periodVisits = remaining
            .filter(
                (visit) => visit.placeId === period.placeId && visit.start >= period.from && visit.start <= period.to,
            )
            .sort((a, b) => a.start - b.start);
        let group: RoleVisit[] = [];

        const flush = () => {
            if (group.length) {
                pieces.push(toTimelinePeriod(period.placeId, group, authoritative, customPlaceOfRepresentative));
                group = [];
            }
        };

        for (const visit of periodVisits) {
            const previous = group.at(-1);

            // An authoritative period between two visits splits the derived one.
            if (previous && authoritative.some((auth) => auth.from >= previous.start && auth.from <= visit.start)) {
                flush();
            }

            group.push(visit);
        }

        flush();
    }

    return {
        periods: [...authoritative, ...pieces].sort((a, b) => a.from - b.from || a.to - b.to),
        ignoredVisitCount: derived.ignoredVisitCount,
        unmatchedCustomPlaceIds,
    };
}

function toTimelinePeriod(
    placeId: string,
    visits: RoleVisit[],
    authoritative: readonly RoleTimelinePeriod[],
    customPlaceOfRepresentative: ReadonlyMap<string, number>,
): RoleTimelinePeriod {
    const from = visits[0]!.start;
    let to = Math.max(...visits.map((visit) => visit.end));

    // A visit may end after an authoritative period started (moving day): the derived period ends there.
    for (const auth of authoritative) {
        if (auth.from > from && auth.from < to) {
            to = auth.from;
        }
    }

    const inferredVisitCount = visits.filter((visit) => visit.inferred).length;
    const customPlaceId = customPlaceOfRepresentative.get(placeId);

    return {
        placeId,
        from,
        to,
        visitCount: visits.length,
        inferredVisitCount,
        inferred: inferredVisitCount === visits.length,
        source: 'visits',
        ...(customPlaceId === undefined ? {} : { customPlaceId }),
    };
}
