import { haversineMeters } from './geo.util.js';
import type { GeocodablePlace } from '../graph/place-geocode.service.js';

/** The part of a Mapbox Geocoding v5 reverse response (`mapbox.places`) the refinement reads. */
export interface MapboxReverseResponse {
    features?: MapboxFeature[];
    message?: string;
}

export interface MapboxFeature {
    id?: string;
    place_type?: string[];
    /** Name of the feature: POI name, or the street for an address. */
    text?: string;
    place_name?: string;
    /** House number of an `address` feature. */
    address?: string;
    properties?: { category?: string; address?: string; maki?: string };
    context?: { id?: string; text?: string; short_code?: string }[];
}

/** What the Mapbox refinement stores on a canonical place. */
export interface MapboxPlaceDetails {
    mapboxFound: boolean;
    mapboxId?: string;
    /** POI name at the point, if Mapbox has one. */
    mapboxName?: string;
    mapboxCategory?: string;
    mapboxPlaceName?: string;
    mapboxRoad?: string;
    mapboxHouseNumber?: string;
    mapboxPostcode?: string;
    mapboxSuburb?: string;
    mapboxCity?: string;
    mapboxCountryCode?: string;
}

export const MAPBOX_GEOCODE_PROPERTY_KEYS = [
    'mapboxFound',
    'mapboxId',
    'mapboxName',
    'mapboxCategory',
    'mapboxPlaceName',
    'mapboxRoad',
    'mapboxHouseNumber',
    'mapboxPostcode',
    'mapboxSuburb',
    'mapboxCity',
    'mapboxCountryCode',
    'mapboxRefinedAt',
    'mapboxRefinedLatitude',
    'mapboxRefinedLongitude',
] as const;

export const DEFAULT_MAPBOX_BASE_URL = 'https://api.mapbox.com';

/**
 * Only the temporary Geocoding API may be used, never the (billed) permanent one: no `mapbox.places-permanent`
 * endpoint (v5) and no `permanent=true` (v6). Every request URL goes through this check.
 */
export function assertTemporaryGeocodingUrl(url: string): void {
    const parsed = new URL(url);

    if (/permanent/i.test(parsed.pathname) || /^(true|1)$/i.test(parsed.searchParams.get('permanent') ?? '')) {
        throw new Error('Refusing to call the Mapbox permanent Geocoding API; only the temporary API is allowed');
    }
}

/**
 * Reverse geocoding with the temporary Geocoding API (v5, `mapbox.places`). Two feature types without `limit`: Mapbox
 * then returns the nearest POI and the nearest address, one each.
 */
export function buildMapboxReverseUrl(
    baseUrl: string,
    accessToken: string,
    point: { latitude: number; longitude: number },
    language: string,
): string {
    const url = new URL(
        `geocoding/v5/mapbox.places/${point.longitude.toFixed(6)},${point.latitude.toFixed(6)}.json`,
        baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`,
    );
    url.searchParams.set('types', 'poi,address');
    url.searchParams.set('access_token', accessToken);

    if (language) {
        // Mapbox takes a comma-separated list of ISO codes, like Accept-Language without weights.
        url.searchParams.set('language', language);
    }

    return url.toString();
}

function contextText(feature: MapboxFeature | undefined, type: string): string | undefined {
    return feature?.context?.find((entry) => entry.id?.startsWith(`${type}.`))?.text?.trim() || undefined;
}

function countryCode(feature: MapboxFeature | undefined): string | undefined {
    const code = feature?.context?.find((entry) => entry.id?.startsWith('country.'))?.short_code;

    return code ? code.toUpperCase() : undefined;
}

/** Maps a reverse response; `{ mapboxFound: false }` when Mapbox has neither a POI nor an address there. */
export function mapMapboxReverse(response: MapboxReverseResponse): MapboxPlaceDetails {
    const features = response.features ?? [];
    const poi = features.find((feature) => feature.place_type?.includes('poi'));
    const address = features.find((feature) => feature.place_type?.includes('address'));
    const primary = poi ?? address;

    if (!primary) {
        return { mapboxFound: false };
    }

    const details: MapboxPlaceDetails = {
        mapboxFound: true,
        mapboxId: primary.id,
        mapboxName: poi?.text?.trim() || undefined,
        mapboxCategory: poi?.properties?.category,
        mapboxPlaceName: primary.place_name,
        mapboxRoad: address?.text?.trim() || undefined,
        mapboxHouseNumber: address?.address?.trim() || undefined,
        mapboxPostcode: contextText(primary, 'postcode'),
        mapboxSuburb: contextText(primary, 'neighborhood') ?? contextText(primary, 'locality'),
        mapboxCity: contextText(primary, 'place'),
        mapboxCountryCode: countryCode(primary),
    };

    return Object.fromEntries(
        Object.entries(details).filter(([, value]) => value !== undefined && value !== ''),
    ) as unknown as MapboxPlaceDetails;
}

export interface MapboxSelectionOptions {
    now: Date;
    refreshDays?: number;
    movedMeters: number;
    maxPlaces: number;
}

function needsMapbox(place: GeocodablePlace, options: MapboxSelectionOptions): boolean {
    if (!place.mapboxRefinedAt) {
        return true;
    }

    if (
        place.mapboxRefinedLatitude !== undefined &&
        place.mapboxRefinedLongitude !== undefined &&
        haversineMeters(
            { latitude: place.latitude, longitude: place.longitude },
            { latitude: place.mapboxRefinedLatitude, longitude: place.mapboxRefinedLongitude },
        ) > options.movedMeters
    ) {
        return true;
    }

    if (options.refreshDays !== undefined) {
        const age = options.now.getTime() - Date.parse(place.mapboxRefinedAt);

        return age > options.refreshDays * 24 * 60 * 60 * 1000;
    }

    return false;
}

/** Places due for Mapbox refinement, most visited first. */
export function selectPlacesForMapbox(
    places: GeocodablePlace[],
    options: MapboxSelectionOptions,
): { selected: GeocodablePlace[]; pending: number } {
    const due = places
        .filter((place) => needsMapbox(place, options))
        .sort((a, b) => b.visitCount - a.visitCount || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

    return { selected: due.slice(0, options.maxPlaces), pending: due.length };
}
