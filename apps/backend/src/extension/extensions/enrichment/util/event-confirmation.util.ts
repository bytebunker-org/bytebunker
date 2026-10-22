import { isValidLatLng, type LatLng } from './geo.util.js';
import type { HomeTimeline } from './home-timeline.util.js';
import { joinOverlappingIntervals } from './interval-join.util.js';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

/** Location texts of online meetings: there is nothing to visit. */
const VIRTUAL_LOCATION_PATTERN =
    /https?:\/\/|www\.|\b(zoom|teams|microsoft teams|skype|webex|jitsi|google meet|meet\.google|online|virtual|virtuell|discord|telefon|phone|call)\b/i;

/** Words that say nothing about which place is meant. */
const STOP_WORDS = new Set([
    'the',
    'and',
    'of',
    'at',
    'in',
    'im',
    'am',
    'an',
    'der',
    'die',
    'das',
    'den',
    'dem',
    'und',
    'zum',
    'zur',
    'bei',
    'von',
    'str',
    'strasse',
    'gmbh',
    'germany',
    'deutschland',
]);

export interface CalendarEvent {
    id: string;
    start: number;
    /** Missing for events without DTEND; treated as one hour. */
    end?: number;
    locationName?: string;
}

export interface ArriveCandidate extends Partial<LatLng> {
    id: string;
    start: number;
    end: number;
    placeId?: string;
    /** Canonical and raw place names; empty if the place has no name. */
    names: string[];
}

export type ConfirmationMethod = 'name' | 'unnamed-place' | 'overlap';

export interface EventConfirmation {
    eventId: string;
    arriveId: string;
    method: ConfirmationMethod;
    /** 0..1: name matches 0.5 + similarity / 2, an unnamed place at the time 0.4, presence elsewhere 0.3. */
    confidence: number;
    similarity?: number;
    /** Arrival relative to the event start (negative: arrived before it began). */
    offsetMinutes: number;
}

export type EventOutcome =
    | ConfirmationMethod
    | 'no-arrive'
    | 'location-mismatch'
    | 'virtual'
    | 'all-day-no-match'
    | 'only-at-home';

export interface EventConfirmationOptions {
    /** Arrives within this many minutes of the event start can confirm it by name. */
    windowMinutes: number;
    /** Normalised name similarity (0..1) a place name needs to match the event location. */
    minSimilarity: number;
    homeRadiusKm: number;
    /** Events at least this long (or date-only) are all-day: confirmed by name only, anywhere within them. */
    allDayHours: number;
}

export interface EventConfirmationResult {
    confirmations: EventConfirmation[];
    outcomes: Record<EventOutcome, number>;
}

const STRONG_BASE_CONFIDENCE = 0.5;
const UNNAMED_PLACE_CONFIDENCE = 0.4;
const OVERLAP_CONFIDENCE = 0.3;

/**
 * Finds the arrive that confirms each calendar event:
 * - an event with a location: an arrive within ±`windowMinutes` of its start at a place whose name matches the
 *   location text (normalised similarity); if none of those places has a name at all, an arrive at a non-home place
 *   overlapping the event is weaker evidence (`unnamed-place`);
 * - an event without a usable location: an arrive at a non-home place overlapping the event is weak evidence
 *   (`overlap`). Online meetings and all-day events without a name match stay unconfirmed.
 */
export function confirmEvents(
    events: CalendarEvent[],
    arrives: ArriveCandidate[],
    homes: HomeTimeline,
    options: EventConfirmationOptions,
): EventConfirmationResult {
    const windowMs = options.windowMinutes * MINUTE_MS;
    const prepared = events
        .filter((event) => Number.isFinite(event.start))
        .map((event) => {
            const end = event.end !== undefined && event.end > event.start ? event.end : event.start + HOUR_MS;
            const allDay = end - event.start >= options.allDayHours * HOUR_MS;
            const location = event.locationName?.trim() ?? '';

            return {
                event,
                eventEnd: end,
                allDay,
                virtual: location !== '' && VIRTUAL_LOCATION_PATTERN.test(location),
                usableLocation: location !== '' && !VIRTUAL_LOCATION_PATTERN.test(location) && hasWords(location),
                // The interval joined against arrives: wide enough for both the name window and the overlap rule.
                start: allDay ? event.start : event.start - windowMs,
                end: allDay ? end : Math.max(end, event.start + windowMs),
            };
        });

    const candidatesByEvent = new Map<(typeof prepared)[number], ArriveCandidate[]>();

    for (const { left, right } of joinOverlappingIntervals(prepared, arrives)) {
        const list = candidatesByEvent.get(left);

        if (list) {
            list.push(right);
        } else {
            candidatesByEvent.set(left, [right]);
        }
    }

    const outcomes: Record<EventOutcome, number> = {
        name: 0,
        'unnamed-place': 0,
        overlap: 0,
        'no-arrive': 0,
        'location-mismatch': 0,
        virtual: 0,
        'all-day-no-match': 0,
        'only-at-home': 0,
    };
    const confirmations: EventConfirmation[] = [];

    for (const item of prepared) {
        const { event, eventEnd } = item;
        const candidates = candidatesByEvent.get(item) ?? [];
        const confirm = (
            arrive: ArriveCandidate,
            method: ConfirmationMethod,
            confidence: number,
            similarity?: number,
        ) => {
            outcomes[method]++;
            confirmations.push({
                eventId: event.id,
                arriveId: arrive.id,
                method,
                confidence: Math.round(confidence * 100) / 100,
                ...(similarity === undefined ? {} : { similarity: Math.round(similarity * 100) / 100 }),
                offsetMinutes: Math.round((arrive.start - event.start) / MINUTE_MS),
            });
        };

        if (item.virtual) {
            outcomes.virtual++;
            continue;
        }

        if (candidates.length === 0) {
            outcomes['no-arrive']++;
            continue;
        }

        const overlapping = candidates.filter((arrive) => arrive.start < eventEnd && arrive.end > event.start);
        const awayFromHome = overlapping.filter((arrive) => !isAtHome(arrive, homes, options.homeRadiusKm));
        const longestAway = () =>
            awayFromHome.reduce((best, arrive) =>
                overlapMs(arrive, event.start, eventEnd) > overlapMs(best, event.start, eventEnd) ? arrive : best,
            );

        if (item.usableLocation) {
            const nameCandidates = item.allDay
                ? candidates
                : candidates.filter(
                      (arrive) => arrive.start <= event.start + windowMs && arrive.end >= event.start - windowMs,
                  );
            let best: { arrive: ArriveCandidate; similarity: number } | undefined;

            for (const arrive of nameCandidates) {
                for (const name of arrive.names) {
                    const similarity = placeNameSimilarity(event.locationName!, name);

                    if (
                        !best ||
                        similarity > best.similarity ||
                        (similarity === best.similarity &&
                            Math.abs(arrive.start - event.start) < Math.abs(best.arrive.start - event.start))
                    ) {
                        best = { arrive, similarity };
                    }
                }
            }

            if (best && best.similarity >= options.minSimilarity) {
                confirm(best.arrive, 'name', STRONG_BASE_CONFIDENCE + best.similarity / 2, best.similarity);
            } else if (item.allDay) {
                outcomes['all-day-no-match']++;
            } else if (!best && awayFromHome.length > 0) {
                // No candidate place has a name to compare with.
                confirm(longestAway(), 'unnamed-place', UNNAMED_PLACE_CONFIDENCE);
            } else {
                outcomes[best ? 'location-mismatch' : overlapping.length > 0 ? 'only-at-home' : 'no-arrive']++;
            }

            continue;
        }

        if (item.allDay) {
            outcomes['all-day-no-match']++;
        } else if (awayFromHome.length > 0) {
            confirm(longestAway(), 'overlap', OVERLAP_CONFIDENCE);
        } else {
            outcomes[overlapping.length > 0 ? 'only-at-home' : 'no-arrive']++;
        }
    }

    return { confirmations, outcomes };
}

function overlapMs(arrive: ArriveCandidate, start: number, end: number): number {
    return Math.max(0, Math.min(arrive.end, end) - Math.max(arrive.start, start));
}

function isAtHome(arrive: ArriveCandidate, homes: HomeTimeline, homeRadiusKm: number): boolean {
    const home = homes.homeAt(arrive.start);

    if (!home) {
        return false;
    }

    if (arrive.placeId && arrive.placeId === home.placeId) {
        return true;
    }

    if (!isValidLatLng(arrive)) {
        return false;
    }

    return (homes.distanceFromHomeKm(arrive.start, arrive)?.distanceKm ?? Infinity) <= homeRadiusKm;
}

/** Lower case, no diacritics (ä → a, ß → ss), only letters and digits separated by single spaces. */
export function normalisePlaceText(text: string): string {
    return text
        .toLowerCase()
        .replaceAll('ß', 'ss')
        .normalize('NFKD')
        .replaceAll(/\p{M}/gu, '')
        .replaceAll(/[^\p{L}\p{N}]+/gu, ' ')
        .trim();
}

function hasWords(text: string): boolean {
    return tokens(normalisePlaceText(text)).length > 0;
}

/** Significant words: no stop words, no bare numbers (house numbers, postcodes), at least two characters. */
function tokens(normalised: string): string[] {
    return normalised.split(' ').filter((token) => token.length >= 2 && !/^\d+$/.test(token) && !STOP_WORDS.has(token));
}

function bigrams(text: string): Map<string, number> {
    const result = new Map<string, number>();
    const padded = ` ${text} `;

    for (let index = 0; index < padded.length - 1; index++) {
        const gram = padded.slice(index, index + 2);
        result.set(gram, (result.get(gram) ?? 0) + 1);
    }

    return result;
}

/** Sørensen–Dice coefficient over character bigrams, 0..1. */
export function diceSimilarity(a: string, b: string): number {
    if (!a || !b) {
        return 0;
    }

    if (a === b) {
        return 1;
    }

    const gramsA = bigrams(a);
    const gramsB = bigrams(b);
    let intersection = 0;
    let total = 0;

    for (const [gram, count] of gramsA) {
        intersection += Math.min(count, gramsB.get(gram) ?? 0);
        total += count;
    }

    for (const count of gramsB.values()) {
        total += count;
    }

    return (2 * intersection) / total;
}

/** Share of the words of `part` found (exactly or nearly: dice ≥ 0.8) among the words of `whole`. */
function tokenContainment(part: string[], whole: string[]): number {
    if (part.length === 0 || whole.length === 0) {
        return 0;
    }

    const found = part.filter((token) => whole.some((other) => other === token || diceSimilarity(token, other) >= 0.8));

    return found.length / part.length;
}

/**
 * How well a place name matches a calendar location text, 0..1. Location texts are often a name plus an address
 * ("Mensa Petrisberg, Max-Planck-Str. 6, Trier") and place names short ("Mensa Petrisberg"), so besides whole-string
 * similarity the share of the place name's words found in the location counts (and, slightly discounted, the other
 * way round).
 */
export function placeNameSimilarity(locationText: string, placeName: string): number {
    const location = normalisePlaceText(locationText);
    const name = normalisePlaceText(placeName);

    if (!location || !name) {
        return 0;
    }

    if (location === name) {
        return 1;
    }

    const locationTokens = tokens(location);
    const nameTokens = tokens(name);

    return Math.max(
        diceSimilarity(location, name),
        tokenContainment(nameTokens, locationTokens),
        0.9 * tokenContainment(locationTokens, nameTokens),
    );
}
