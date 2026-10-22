import { describe, expect, it } from 'vitest';
import { buildNominatimReverseUrl, mapNominatimReverse, selectPlaceName } from './nominatim.util.js';

describe('buildNominatimReverseUrl', () => {
    it('builds a jsonv2 reverse request with address details', () => {
        const url = new URL(
            buildNominatimReverseUrl('https://nominatim.example.org/sub', { latitude: 53.5, longitude: 9.9 }, 'de,en'),
        );

        expect(url.origin + url.pathname).toBe('https://nominatim.example.org/sub/reverse');
        expect(Object.fromEntries(url.searchParams)).toEqual({
            format: 'jsonv2',
            lat: '53.5000000',
            lon: '9.9000000',
            zoom: '18',
            addressdetails: '1',
            'accept-language': 'de,en',
        });
    });
});

describe('mapNominatimReverse', () => {
    it('maps a POI result', () => {
        expect(
            mapNominatimReverse({
                place_id: 1,
                osm_type: 'node',
                osm_id: 123_456,
                category: 'amenity',
                type: 'cafe',
                name: 'Café Paris',
                display_name: 'Café Paris, 4, Rathausstraße, Altstadt, Hamburg-Mitte, Hamburg, 20095, Deutschland',
                address: {
                    amenity: 'Café Paris',
                    house_number: '4',
                    road: 'Rathausstraße',
                    suburb: 'Altstadt',
                    city_district: 'Hamburg-Mitte',
                    city: 'Hamburg',
                    postcode: '20095',
                    country: 'Deutschland',
                    country_code: 'de',
                },
            } as never),
        ).toEqual({
            osmFound: true,
            osmDisplayName: 'Café Paris, 4, Rathausstraße, Altstadt, Hamburg-Mitte, Hamburg, 20095, Deutschland',
            osmName: 'Café Paris',
            osmCity: 'Hamburg',
            osmCountryCode: 'DE',
            road: 'Rathausstraße',
            houseNumber: '4',
            postcode: '20095',
            suburb: 'Altstadt',
            osmType: 'node',
            osmId: 123_456,
            osmCategory: 'amenity',
            osmPlaceType: 'cafe',
        });
    });

    it('does not treat a street name as a POI name and falls back to town/village', () => {
        const details = mapNominatimReverse({
            osm_type: 'way',
            osm_id: '42',
            category: 'highway',
            type: 'residential',
            name: 'Dorfstraße',
            display_name: 'Dorfstraße, Kleinkleckersdorf, Deutschland',
            address: { road: 'Dorfstraße', village: 'Kleinkleckersdorf', country_code: 'de' },
        });

        expect(details.osmName).toBeUndefined();
        expect(details.osmCity).toBe('Kleinkleckersdorf');
        expect(details.osmId).toBe(42);
        expect(details).not.toHaveProperty('houseNumber');
    });

    it('does not name a place after street furniture', () => {
        const details = mapNominatimReverse({
            osm_type: 'node',
            osm_id: 469_398_929,
            category: 'amenity',
            type: 'post_box',
            name: 'Deutsche Post',
            address: { road: 'Rathausmarkt', house_number: '1', city: 'Hamburg', country_code: 'de' },
        });

        expect(details.osmName).toBeUndefined();
        expect(details.road).toBe('Rathausmarkt');
    });

    it('reports nothing found for an error response', () => {
        expect(mapNominatimReverse({ error: 'Unable to geocode' })).toEqual({ osmFound: false });
    });
});

describe('selectPlaceName', () => {
    it('prefers the OSM POI name, then the source name, then road and house number', () => {
        expect(selectPlaceName({ osmName: 'Café Paris', sourceName: 'Cafe', road: 'Rathausstraße' })).toEqual({
            name: 'Café Paris',
            nameSource: 'osm',
        });
        expect(selectPlaceName({ osmName: ' ', sourceName: 'Lidl', road: 'Rathausstraße' })).toEqual({
            name: 'Lidl',
            nameSource: 'source',
        });
        expect(selectPlaceName({ road: 'Rathausstraße', houseNumber: '4' })).toEqual({
            name: 'Rathausstraße 4',
            nameSource: 'address',
        });
        expect(selectPlaceName({ road: 'Rathausstraße' })).toEqual({ name: 'Rathausstraße', nameSource: 'address' });
        expect(selectPlaceName({ houseNumber: '4' })).toBeUndefined();
    });
});
