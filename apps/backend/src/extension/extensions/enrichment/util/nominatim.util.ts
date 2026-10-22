/** The part of a Nominatim `/reverse?format=jsonv2` response the refinement reads. */
export interface NominatimReverseResponse {
    error?: string;
    osm_type?: string;
    osm_id?: number | string;
    lat?: string;
    lon?: string;
    category?: string;
    type?: string;
    addresstype?: string;
    name?: string | null;
    display_name?: string;
    address?: Record<string, string | undefined>;
}

/** What the refinement stores on a canonical place (undefined keys are removed from the node). */
export interface OsmPlaceDetails {
    osmFound: boolean;
    osmDisplayName?: string;
    /** Name of the POI, amenity or building, if the result is one (not a street, boundary or locality). */
    osmName?: string;
    osmCity?: string;
    osmCountryCode?: string;
    road?: string;
    houseNumber?: string;
    postcode?: string;
    suburb?: string;
    osmType?: string;
    osmId?: number;
    osmCategory?: string;
    osmPlaceType?: string;
}

export function buildNominatimReverseUrl(
    baseUrl: string,
    point: { latitude: number; longitude: number },
    acceptLanguage: string,
): string {
    const url = new URL('reverse', baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('lat', point.latitude.toFixed(7));
    url.searchParams.set('lon', point.longitude.toFixed(7));
    url.searchParams.set('zoom', '18');
    url.searchParams.set('addressdetails', '1');

    if (acceptLanguage) {
        url.searchParams.set('accept-language', acceptLanguage);
    }

    return url.toString();
}

/** Results of these categories are streets, boundaries or areas: their `name` is not the name of a place. */
const NON_POI_CATEGORIES = new Set(['highway', 'place', 'boundary', 'landuse', 'waterway', 'railway']);
/** Street furniture and small objects: the nearest such object names the operator, not the place one visited. */
const NON_POI_TYPES = new Set([
    'post_box',
    'bench',
    'waste_basket',
    'waste_disposal',
    'recycling',
    'vending_machine',
    'bicycle_parking',
    'parking_entrance',
    'parking_space',
    'telephone',
    'drinking_water',
    'atm',
    'charging_station',
    'street_lamp',
    'bus_stop',
    'platform',
    'stop_position',
]);
const CITY_KEYS = ['city', 'town', 'village', 'municipality', 'hamlet'] as const;
const SUBURB_KEYS = ['suburb', 'city_district', 'borough', 'quarter', 'neighbourhood'] as const;
const ROAD_KEYS = ['road', 'pedestrian', 'footway', 'path', 'cycleway', 'square'] as const;

function first(address: Record<string, string | undefined>, keys: readonly string[]): string | undefined {
    for (const key of keys) {
        const value = address[key]?.trim();

        if (value) {
            return value;
        }
    }

    return undefined;
}

/** Maps a reverse response to place details; `{ osmFound: false }` when Nominatim found nothing there (open sea …). */
export function mapNominatimReverse(response: NominatimReverseResponse): OsmPlaceDetails {
    if (response.error || !response.osm_type) {
        return { osmFound: false };
    }

    const address = response.address ?? {};
    const road = first(address, ROAD_KEYS);
    const name = response.name?.trim();
    const category = response.category;
    const isPoi =
        !!name &&
        !!category &&
        !NON_POI_CATEGORIES.has(category) &&
        !NON_POI_TYPES.has(response.type ?? '') &&
        name !== road;
    const osmId = Number(response.osm_id);
    const details: OsmPlaceDetails = {
        osmFound: true,
        osmDisplayName: response.display_name,
        osmName: isPoi ? name : undefined,
        osmCity: first(address, CITY_KEYS),
        osmCountryCode: address['country_code']?.toUpperCase(),
        road,
        houseNumber: address['house_number']?.trim() || undefined,
        postcode: address['postcode']?.trim() || undefined,
        suburb: first(address, SUBURB_KEYS),
        osmType: response.osm_type,
        osmId: Number.isFinite(osmId) ? osmId : undefined,
        osmCategory: category,
        osmPlaceType: response.type,
    };

    return Object.fromEntries(
        Object.entries(details).filter(([, value]) => value !== undefined && value !== ''),
    ) as unknown as OsmPlaceDetails;
}

export type PlaceNameSource = 'custom' | 'osm' | 'mapbox' | 'source' | 'address';

export interface PlaceNameInput {
    /** Name of the user-defined place (Settings → custom places) the place lies in; beats every provider. */
    customName?: string | null;
    osmName?: string | null;
    /** POI name from the Mapbox refinement. */
    mapboxName?: string | null;
    /** The name the place had from its source data (e.g. Google Timeline), set by consolidate-places. */
    sourceName?: string | null;
    road?: string | null;
    houseNumber?: string | null;
}

/** Custom place name > OSM POI name > Mapbox POI name > name from the source data > road and house number. */
export function selectPlaceName(input: PlaceNameInput): { name: string; nameSource: PlaceNameSource } | undefined {
    const customName = input.customName?.trim();

    if (customName) {
        return { name: customName, nameSource: 'custom' };
    }

    const osmName = input.osmName?.trim();

    if (osmName) {
        return { name: osmName, nameSource: 'osm' };
    }

    const mapboxName = input.mapboxName?.trim();

    if (mapboxName) {
        return { name: mapboxName, nameSource: 'mapbox' };
    }

    const sourceName = input.sourceName?.trim();

    if (sourceName) {
        return { name: sourceName, nameSource: 'source' };
    }

    const road = input.road?.trim();

    if (road) {
        const houseNumber = input.houseNumber?.trim();

        return { name: houseNumber ? `${road} ${houseNumber}` : road, nameSource: 'address' };
    }

    return undefined;
}
