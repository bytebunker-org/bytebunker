import { haversineMeters } from './geo.util.js';
import type { OfflineGeocode } from './geonames.util.js';
import { type OsmPlaceDetails, selectPlaceName } from './nominatim.util.js';
import { ONLINE_GEOCODE_PROPERTY_KEYS } from '../geocoding/geocoding.constant.js';
import type { GeocodablePlace } from '../graph/place-geocode.service.js';

/**
 * The name the place got from its source data. consolidate-places stores it as `sourceName`; places written before
 * that only have `name`, which is the source name as long as no geocoding module has picked another one.
 */
export function sourceNameOf(place: GeocodablePlace): string | undefined {
    if (place.sourceName) {
        return place.sourceName;
    }

    return !place.nameSource || place.nameSource === 'source' ? place.name : undefined;
}

function nameProps(
    place: GeocodablePlace,
    fields: { osmName?: string; road?: string; houseNumber?: string },
): Record<string, unknown> {
    const sourceName = sourceNameOf(place);
    const selected = selectPlaceName({ ...fields, sourceName });

    return {
        // Pins the source name before `name` is overwritten, so a later run still knows it.
        ...(sourceName && !place.sourceName ? { sourceName } : {}),
        ...(selected ? { name: selected.name, nameSource: selected.nameSource } : {}),
    };
}

/**
 * Properties enrichment:geocode-places-offline writes. Values from the online refinement win where both exist (city,
 * country code); everything else comes from GeoNames. `null` clears values of earlier runs.
 */
export function buildOfflineGeocodeProps(
    place: GeocodablePlace,
    geocode: OfflineGeocode | undefined,
    countries: Map<string, string>,
    now: Date,
): Record<string, unknown> {
    const countryCode = place.osmCountryCode ?? geocode?.countryCode;
    const country = countryCode ? (countries.get(countryCode) ?? geocode?.country) : undefined;

    return {
        geonamesCity: geocode?.geonamesCity ?? null,
        geonamesId: geocode?.geonamesId ?? null,
        metroCity: geocode?.metroCity ?? null,
        admin1: geocode?.admin1 ?? null,
        countryCode: countryCode ?? null,
        country: country ?? null,
        timezone: geocode?.timezone ?? null,
        cityDistanceKm: geocode?.cityDistanceKm ?? null,
        city: place.osmCity ?? geocode?.geonamesCity ?? null,
        offlineGeocodedAt: now.toISOString(),
        ...nameProps(place, { osmName: place.osmName, road: place.road, houseNumber: place.houseNumber }),
    };
}

/** Properties enrichment:refine-places-online writes for one Nominatim answer. */
export function buildRefinementProps(
    place: GeocodablePlace,
    details: OsmPlaceDetails,
    now: Date,
): Record<string, unknown> {
    const props: Record<string, unknown> = {};

    for (const key of ONLINE_GEOCODE_PROPERTY_KEYS) {
        props[key] = (details as unknown as Record<string, unknown>)[key] ?? null;
    }

    return {
        ...props,
        osmFound: details.osmFound,
        refinedAt: now.toISOString(),
        refinedLatitude: place.latitude,
        refinedLongitude: place.longitude,
        city: details.osmCity ?? place.geonamesCity ?? null,
        ...nameProps(place, details),
    };
}

export interface RefineSelectionOptions {
    now: Date;
    /** Re-refine places refined longer ago than this many days. Undefined: never. */
    refreshDays?: number;
    /** Re-refine places whose coordinates moved more than this since their refinement (re-consolidation). */
    movedMeters: number;
    maxPlaces: number;
}

export function needsRefinement(place: GeocodablePlace, options: Omit<RefineSelectionOptions, 'maxPlaces'>): boolean {
    if (!place.refinedAt || place.refinedLatitude === undefined || place.refinedLongitude === undefined) {
        return true;
    }

    if (options.refreshDays !== undefined) {
        const refinedAt = Date.parse(place.refinedAt);

        if (Number.isNaN(refinedAt) || refinedAt < options.now.getTime() - options.refreshDays * 86_400_000) {
            return true;
        }
    }

    return (
        haversineMeters(place, { latitude: place.refinedLatitude, longitude: place.refinedLongitude }) >
        options.movedMeters
    );
}

/** Places due for refinement, most visited first, at most `maxPlaces`; `pending` counts all due places. */
export function selectPlacesToRefine(
    places: GeocodablePlace[],
    options: RefineSelectionOptions,
): { selected: GeocodablePlace[]; pending: number } {
    const due = places
        .filter((place) => needsRefinement(place, options))
        .sort((a, b) => b.visitCount - a.visitCount || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

    return { selected: due.slice(0, options.maxPlaces), pending: due.length };
}
