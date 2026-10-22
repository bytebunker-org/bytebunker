import type { InferGraphEntityType, SchemaObject } from '@bytebunker/neode/types';
import type { ASObjectNodeType } from '../as-object.schema.js';

/**
 * A real-world place consolidated from many raw `Place` nodes (enrichment:consolidate-places). Also carries the
 * derived-data provenance (`derived`, `derivedBy`, `derivedVersion`, `importExecutionId`) and `placeIds`, a list of
 * Google place ids, which neode cannot describe and is therefore not part of the schema. Geocoding properties are
 * added by the geocoding modules and kept when consolidation rewrites the node.
 */
export const CanonicalPlaceSchema = {
    latitude: 'float',
    longitude: 'float',
    visitCount: 'number',
    memberCount: 'number',
    spanMeters: 'float',
    ambiguous: 'boolean',
    derived: 'boolean',
    // Indexed: replacing a module's output looks its previous nodes up by this.
    derivedBy: {
        type: 'string',
        indexed: true,
    },
    derivedVersion: 'number',

    // Name from the source data; `name` may be replaced by a better one (see `nameSource`: osm | source | address).
    sourceName: 'string',
    nameSource: 'string',

    // Offline reverse geocoding from GeoNames (enrichment:geocode-places-offline).
    /** OSM city if refined, else the GeoNames city. */
    city: 'string',
    geonamesCity: 'string',
    geonamesId: 'number',
    /** Most populous city of the same country nearby, used for trip names. */
    metroCity: 'string',
    admin1: 'string',
    countryCode: 'string',
    country: 'string',
    /** IANA timezone, also copied onto the place's arrives and moves as `localTimezone`. */
    timezone: 'string',
    cityDistanceKm: 'float',
    offlineGeocodedAt: 'string',

    // Online refinement from Nominatim/OSM (enrichment:refine-places-online). Data © OpenStreetMap contributors, ODbL.
    osmFound: 'boolean',
    osmDisplayName: 'string',
    osmName: 'string',
    osmCity: 'string',
    osmCountryCode: 'string',
    road: 'string',
    houseNumber: 'string',
    postcode: 'string',
    suburb: 'string',
    osmType: 'string',
    osmId: 'number',
    osmCategory: 'string',
    osmPlaceType: 'string',
    refinedAt: 'string',
    refinedLatitude: 'float',
    refinedLongitude: 'float',
} satisfies SchemaObject;

export type CanonicalPlaceNodeType = InferGraphEntityType<typeof CanonicalPlaceSchema> & ASObjectNodeType;
