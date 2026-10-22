import { describe, expect, it } from 'vitest';
import {
    assertTemporaryGeocodingUrl,
    buildMapboxReverseUrl,
    mapMapboxReverse,
    selectPlacesForMapbox,
} from './mapbox.util.js';
import { selectPlaceName } from './nominatim.util.js';
import type { GeocodablePlace } from '../graph/place-geocode.service.js';

const CONTEXT = [
    { id: 'postcode.1', text: '54290' },
    { id: 'neighborhood.2', text: 'Altstadt' },
    { id: 'place.3', text: 'Trier' },
    { id: 'region.4', text: 'Rheinland-Pfalz', short_code: 'DE-RP' },
    { id: 'country.5', text: 'Deutschland', short_code: 'de' },
];

describe('mapbox.util', () => {
    it('builds a v5 reverse URL for POIs and addresses', () => {
        const url = new URL(
            buildMapboxReverseUrl('https://api.mapbox.com', 'tok', { latitude: 49.75, longitude: 6.64 }, 'de,en'),
        );

        expect(url.pathname).toBe('/geocoding/v5/mapbox.places/6.640000,49.750000.json');
        expect(url.searchParams.get('types')).toBe('poi,address');
        expect(url.searchParams.get('language')).toBe('de,en');
        expect(url.searchParams.get('access_token')).toBe('tok');
        expect(url.searchParams.has('limit')).toBe(false);
    });

    it('maps the nearest POI and the nearest address', () => {
        const details = mapMapboxReverse({
            features: [
                {
                    id: 'poi.1',
                    place_type: ['poi'],
                    text: 'Café Mohr',
                    place_name: 'Café Mohr, Trier',
                    properties: { category: 'cafe, coffee' },
                    context: CONTEXT,
                },
                {
                    id: 'address.2',
                    place_type: ['address'],
                    text: 'Simeonstraße',
                    address: '12',
                    place_name: 'Simeonstraße 12, 54290 Trier',
                    context: CONTEXT,
                },
            ],
        });

        expect(details).toEqual({
            mapboxFound: true,
            mapboxId: 'poi.1',
            mapboxName: 'Café Mohr',
            mapboxCategory: 'cafe, coffee',
            mapboxPlaceName: 'Café Mohr, Trier',
            mapboxRoad: 'Simeonstraße',
            mapboxHouseNumber: '12',
            mapboxPostcode: '54290',
            mapboxSuburb: 'Altstadt',
            mapboxCity: 'Trier',
            mapboxCountryCode: 'DE',
        });
    });

    it('reports nothing found for an empty answer', () => {
        expect(mapMapboxReverse({ features: [] })).toEqual({ mapboxFound: false });
    });

    it('selects unrefined and moved places, most visited first', () => {
        const place = (id: string, visitCount: number, extra: Partial<GeocodablePlace> = {}): GeocodablePlace => ({
            id,
            latitude: 49.75,
            longitude: 6.64,
            visitCount,
            ...extra,
        });
        const { selected, pending } = selectPlacesForMapbox(
            [
                place('a', 1),
                place('b', 9),
                place('c', 5, {
                    mapboxRefinedAt: '2026-01-01T00:00:00Z',
                    mapboxRefinedLatitude: 49.75,
                    mapboxRefinedLongitude: 6.64,
                }),
                place('d', 3, {
                    mapboxRefinedAt: '2026-01-01T00:00:00Z',
                    mapboxRefinedLatitude: 49.76,
                    mapboxRefinedLongitude: 6.64,
                }),
            ],
            { now: new Date('2026-10-22T00:00:00Z'), movedMeters: 100, maxPlaces: 10 },
        );

        expect(selected.map((p) => p.id)).toEqual(['b', 'd', 'a']);
        expect(pending).toBe(3);
    });

    it('names a place OSM POI first, then the Mapbox POI', () => {
        expect(selectPlaceName({ osmName: 'OSM Café', mapboxName: 'Mapbox Café' })).toEqual({
            name: 'OSM Café',
            nameSource: 'osm',
        });
        expect(selectPlaceName({ mapboxName: 'Mapbox Café', road: 'Rathausstraße' })).toEqual({
            name: 'Mapbox Café',
            nameSource: 'mapbox',
        });
        expect(selectPlaceName({ mapboxName: 'Mapbox Café', sourceName: 'Source' })).toEqual({
            name: 'Source',
            nameSource: 'source',
        });
    });

    it('never allows the permanent Geocoding API', () => {
        expect(() =>
            assertTemporaryGeocodingUrl(
                buildMapboxReverseUrl('https://api.mapbox.com', 't', { latitude: 1, longitude: 2 }, 'de'),
            ),
        ).not.toThrow();
        expect(() =>
            assertTemporaryGeocodingUrl('https://api.mapbox.com/geocoding/v5/mapbox.places-permanent/2,1.json'),
        ).toThrow(/permanent/);
        expect(() =>
            assertTemporaryGeocodingUrl(
                'https://api.mapbox.com/search/geocode/v6/reverse?longitude=2&latitude=1&permanent=true',
            ),
        ).toThrow(/permanent/);
    });
});
