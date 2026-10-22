import { DateTime } from 'luxon';

export type GoogleMapsPlacesKind = 'saved' | 'reviews';

export interface GoogleMapsPlaceEntry {
    kind: GoogleMapsPlacesKind;
    date: DateTime<true>;
    mapsUrl: string;
    /** Decimal customer id, derived from `cid=`, `ftid=` or the `!1s0x0:0x…` data parameter. */
    cid?: string;
    name?: string;
    address?: string;
    countryCode?: string;
    latitude?: number;
    longitude?: number;
    /** Star rating (reviews only). */
    rating?: number;
    /** Review text (reviews only). */
    reviewText?: string;
}

export interface GoogleMapsPlacesParseResult {
    kind: GoogleMapsPlacesKind;
    entries: GoogleMapsPlaceEntry[];
    /** Features that could not be turned into an entry (no date, no URL, malformed). */
    skipped: number;
}

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json => !!value && typeof value === 'object' && !Array.isArray(value);
const asString = (value: unknown): string | undefined =>
    typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;

/** First present value among several spellings of a key (German export: snake_case, English: Title Case). */
function pick(source: Json, ...keys: string[]): unknown {
    for (const key of keys) {
        if (source[key] !== undefined) {
            return source[key];
        }
    }

    return undefined;
}

/** Whether a file name or sampled content looks like a Maps saved places / reviews GeoJSON. */
export function sniffGoogleMapsPlaces(
    fileName: string,
    head: string,
): { kind: GoogleMapsPlacesKind; confidence: number } | undefined {
    if (!/"type"\s*:\s*"FeatureCollection"/.test(head) || !/"(google_maps_url|Google Maps URL)"\s*:/.test(head)) {
        return undefined;
    }

    const hasRating = /"(five_star_rating_published|Star Rating)"\s*:/.test(head);
    const reviewName = /^(bewertungen|reviews)\.json$/i.test(fileName);
    const savedName = /^(gespeicherte orte|saved places)\.json$/i.test(fileName);

    if (hasRating || reviewName) {
        return { kind: 'reviews', confidence: hasRating && reviewName ? 0.97 : 0.9 };
    }

    return { kind: 'saved', confidence: savedName ? 0.97 : 0.9 };
}

/**
 * Derives the decimal cid from a Maps URL. `ftid=0x<feature>:0x<cid hex>` and `!1s0x0:0x<cid hex>` both carry the
 * cid as the second hex number.
 */
export function extractCid(mapsUrl: string): string | undefined {
    const cid = /[&?]cid=(\d+)/.exec(mapsUrl)?.[1];

    if (cid) {
        return cid;
    }

    const hex = /(?:ftid=|!1s)0x[\da-f]+:0x([\da-f]+)/i.exec(mapsUrl)?.[1];

    return hex ? BigInt(`0x${hex}`).toString() : undefined;
}

/** Coordinates or a name from the legacy `?q=` parameter (`q=49.6,6.2` or `q=Some Place, 12345 City&ftid=…`). */
function parseQuery(mapsUrl: string): { latitude?: number; longitude?: number; name?: string } {
    const q = /[&?]q=([^&]*)/.exec(mapsUrl)?.[1];

    if (!q) {
        return {};
    }

    let decoded = q;

    try {
        decoded = decodeURIComponent(q);
    } catch {
        // keep the raw value
    }

    const coordinates = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(decoded);

    if (coordinates) {
        return { latitude: Number(coordinates[1]), longitude: Number(coordinates[2]) };
    }

    return { name: asString(decoded) };
}

function parseCoordinates(
    geometry: unknown,
    location: Json | undefined,
): { latitude: number; longitude: number } | undefined {
    const geo = isObject(location?.['Geo Coordinates']) ? location['Geo Coordinates'] : undefined;
    const coordinates = isObject(geometry) && Array.isArray(geometry['coordinates']) ? geometry['coordinates'] : [];
    const longitude = Number(geo?.['Longitude'] ?? coordinates[0]);
    const latitude = Number(geo?.['Latitude'] ?? coordinates[1]);

    // The export writes [0, 0] when it has no location for the entry.
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || (latitude === 0 && longitude === 0)) {
        return undefined;
    }

    if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
        return undefined;
    }

    return { latitude, longitude };
}

function parseFeature(feature: unknown, kind: GoogleMapsPlacesKind): GoogleMapsPlaceEntry | undefined {
    if (!isObject(feature) || !isObject(feature['properties'])) {
        return undefined;
    }

    const properties = feature['properties'];
    const mapsUrl = asString(pick(properties, 'google_maps_url', 'Google Maps URL'));
    const rawDate = asString(pick(properties, 'date', 'Published'));
    const date = rawDate ? DateTime.fromISO(rawDate) : undefined;

    if (!mapsUrl || !date?.isValid) {
        return undefined;
    }

    const rawLocation = pick(properties, 'location', 'Location');
    const location = isObject(rawLocation) ? rawLocation : undefined;
    const query = parseQuery(mapsUrl);
    const coordinates =
        parseCoordinates(feature['geometry'], location) ??
        (query.latitude !== undefined && query.longitude !== undefined
            ? { latitude: query.latitude, longitude: query.longitude }
            : undefined);
    const rating = Number(pick(properties, 'five_star_rating_published', 'Star Rating'));

    return {
        kind,
        date,
        mapsUrl,
        cid: extractCid(mapsUrl),
        name: asString(pick(location ?? {}, 'name', 'Business Name')) ?? asString(properties['Title']) ?? query.name,
        address: asString(pick(location ?? {}, 'address', 'Address')),
        countryCode: asString(pick(location ?? {}, 'country_code', 'Country Code')),
        ...coordinates,
        ...(kind === 'reviews' && Number.isFinite(rating) ? { rating } : {}),
        ...(kind === 'reviews'
            ? { reviewText: asString(pick(properties, 'review_text_published', 'Review Comment')) }
            : {}),
    };
}

/** Parses a Maps "Gespeicherte Orte" / "Saved Places" or "Bewertungen" / "Reviews" GeoJSON file. */
export function parseGoogleMapsPlaces(json: string, kindHint?: GoogleMapsPlacesKind): GoogleMapsPlacesParseResult {
    const document: unknown = JSON.parse(json);
    const features = isObject(document) && Array.isArray(document['features']) ? document['features'] : [];

    const hasRating = (feature: unknown): boolean =>
        isObject(feature) &&
        isObject(feature['properties']) &&
        pick(feature['properties'], 'five_star_rating_published', 'Star Rating') !== undefined;
    const kind = kindHint ?? (features.some(hasRating) ? 'reviews' : 'saved');

    const entries: GoogleMapsPlaceEntry[] = [];
    let skipped = 0;

    for (const feature of features) {
        const entry = parseFeature(feature, kind);

        if (entry) {
            entries.push(entry);
        } else {
            skipped++;
        }
    }

    return { kind, entries, skipped };
}
