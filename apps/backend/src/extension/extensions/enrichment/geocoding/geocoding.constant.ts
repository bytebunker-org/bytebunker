import { CUSTOM_PLACE_PROPERTY_KEYS } from '../util/custom-places.util.js';
import { MAPBOX_GEOCODE_PROPERTY_KEYS } from '../util/mapbox.util.js';
export const DEFAULT_GEONAMES_DATA_DIR = './temp/geonames';
export const DEFAULT_GEONAMES_BASE_URL = 'https://download.geonames.org/export/dump';
export const DEFAULT_NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org';
/** The public Nominatim usage policy allows at most one request per second. */
export const PUBLIC_NOMINATIM_MIN_INTERVAL_MS = 1000;
export const PUBLIC_NOMINATIM_HOST = 'nominatim.openstreetmap.org';
/** Identifies the application as the Nominatim usage policy requires (deliberately without an e-mail address). */
export const NOMINATIM_USER_AGENT = 'bytebunker-personal-archive/1.0';
export const DEFAULT_ACCEPT_LANGUAGE = 'de,en';
export const OSM_ATTRIBUTION = 'Data © OpenStreetMap contributors, ODbL 1.0';
export const GEONAMES_ATTRIBUTION = 'GeoNames (geonames.org), CC BY 4.0';

/**
 * Properties the geocoding modules store on `CanonicalPlace`. enrichment:consolidate-places rewrites its nodes
 * completely on every run; it keeps these, so the slow online refinement survives the nightly re-consolidation.
 * `name`/`nameSource` are not kept: consolidation resets `name` to the source name, and
 * enrichment:geocode-places-offline (next in the blueprint) picks the best name again.
 */
export const OFFLINE_GEOCODE_PROPERTY_KEYS = [
    'geonamesCity',
    'geonamesId',
    'metroCity',
    'admin1',
    'countryCode',
    'country',
    'timezone',
    'cityDistanceKm',
    'offlineGeocodedAt',
    'city',
] as const;

export const ONLINE_GEOCODE_PROPERTY_KEYS = [
    'osmDisplayName',
    'osmName',
    'osmCity',
    'osmCountryCode',
    'road',
    'houseNumber',
    'postcode',
    'suburb',
    'osmType',
    'osmId',
    'osmCategory',
    'osmPlaceType',
    'osmFound',
    'refinedAt',
    'refinedLatitude',
    'refinedLongitude',
] as const;

export const GEOCODE_PROPERTY_KEYS: readonly string[] = [
    ...OFFLINE_GEOCODE_PROPERTY_KEYS,
    ...ONLINE_GEOCODE_PROPERTY_KEYS,
    ...MAPBOX_GEOCODE_PROPERTY_KEYS,
    // The custom place a canonical place lies in; geocode-places-offline re-checks it on every run.
    ...CUSTOM_PLACE_PROPERTY_KEYS,
];

/** Mapbox allows 600 reverse requests per minute; 150 ms keeps well below that. */
export const DEFAULT_MAPBOX_MIN_INTERVAL_MS = 150;
