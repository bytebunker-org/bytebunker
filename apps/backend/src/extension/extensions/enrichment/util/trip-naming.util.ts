export interface NamedDestination {
    placeId: string;
    dwellMs: number;
    /** Distance from home. */
    distanceKm: number;
}

export interface DestinationGeocode {
    city?: string;
    /** Big city nearby, preferred for trip names. */
    metroCity?: string;
    countryCode?: string;
    country?: string;
}

/** Destinations at least this share of the farthest destination's distance compete for the trip's name. */
const FAR_SHARE = 0.5;

interface Area {
    city?: string;
    countryCode?: string;
    country?: string;
    dwellMs: number;
    distanceKm: number;
}

/**
 * Names a trip after its main destination: among the destinations that are far away (≥ half the farthest), the city
 * (or, without one, the country) with the most dwell time. "Trip to Hamburg" within the home country, "Trip to Tokyo,
 * Japan" abroad (or when the home country is unknown). Undefined if no destination is geocoded.
 */
export function geocodedTripName(
    destinations: NamedDestination[],
    geocodes: Map<string, DestinationGeocode>,
    homeCountryCode: string | undefined,
): string | undefined {
    const areas = new Map<string, Area>();

    for (const destination of destinations) {
        const geocode = geocodes.get(destination.placeId);
        const city = geocode?.metroCity ?? geocode?.city;

        if (!geocode || (!city && !geocode.countryCode)) {
            continue;
        }

        const key = `${geocode.countryCode ?? ''}|${city ?? ''}`;
        const area = areas.get(key) ?? {
            city,
            countryCode: geocode.countryCode,
            country: geocode.country,
            dwellMs: 0,
            distanceKm: 0,
        };
        area.dwellMs += destination.dwellMs;
        area.distanceKm = Math.max(area.distanceKm, destination.distanceKm);
        areas.set(key, area);
    }

    if (areas.size === 0) {
        return undefined;
    }

    const farthest = Math.max(...[...areas.values()].map((area) => area.distanceKm));
    const candidates = [...areas.values()].filter((area) => area.distanceKm >= farthest * FAR_SHARE);
    // Areas with a city beat country-only ones; then dwell time, then distance.
    const main = candidates.sort(
        (a, b) => Number(!!b.city) - Number(!!a.city) || b.dwellMs - a.dwellMs || b.distanceKm - a.distanceKm,
    )[0]!;
    const domestic = !!main.countryCode && main.countryCode === homeCountryCode;
    const countryLabel = main.country ?? main.countryCode;

    if (!main.city) {
        return countryLabel ? `Trip to ${countryLabel}` : undefined;
    }

    return !domestic && countryLabel ? `Trip to ${main.city}, ${countryLabel}` : `Trip to ${main.city}`;
}
