import { describe, expect, it } from 'vitest';
import type { GeocodablePlace } from '../graph/place-geocode.service.js';
import {
    buildOfflineGeocodeProps,
    buildRefinementProps,
    needsRefinement,
    selectPlacesToRefine,
    sourceNameOf,
} from './place-geocoding.util.js';

const now = new Date('2026-10-22T12:00:00.000Z');
const countries = new Map([
    ['DE', 'Germany'],
    ['LU', 'Luxembourg'],
]);

function place(overrides: Partial<GeocodablePlace> = {}): GeocodablePlace {
    return { id: 'p1', latitude: 53.55, longitude: 9.99, visitCount: 3, ...overrides };
}

const hamburg = {
    geonamesId: 2_911_298,
    geonamesCity: 'Hamburg',
    metroCity: 'Hamburg',
    admin1: 'Hamburg',
    countryCode: 'DE',
    country: 'Germany',
    timezone: 'Europe/Berlin',
    cityDistanceKm: 0.4,
};

describe('sourceNameOf', () => {
    it('uses sourceName, else the name unless a geocoding module chose it', () => {
        expect(sourceNameOf(place({ sourceName: 'Lidl', name: 'Lidl Filiale' }))).toBe('Lidl');
        expect(sourceNameOf(place({ name: 'Lidl' }))).toBe('Lidl');
        expect(sourceNameOf(place({ name: 'Lidl', nameSource: 'source' }))).toBe('Lidl');
        expect(sourceNameOf(place({ name: 'Rathausmarkt 1', nameSource: 'address' }))).toBeUndefined();
    });
});

describe('buildOfflineGeocodeProps', () => {
    it('writes the GeoNames result and keeps the source name', () => {
        expect(buildOfflineGeocodeProps(place({ name: 'Lidl' }), hamburg, countries, now)).toEqual({
            geonamesCity: 'Hamburg',
            geonamesId: 2_911_298,
            metroCity: 'Hamburg',
            admin1: 'Hamburg',
            countryCode: 'DE',
            country: 'Germany',
            timezone: 'Europe/Berlin',
            cityDistanceKm: 0.4,
            city: 'Hamburg',
            offlineGeocodedAt: now.toISOString(),
            sourceName: 'Lidl',
            name: 'Lidl',
            nameSource: 'source',
        });
    });

    it('prefers the refined OSM city, country and POI name', () => {
        const props = buildOfflineGeocodeProps(
            place({
                sourceName: 'Supermarket',
                name: 'Supermarket',
                osmName: 'Cactus',
                osmCity: 'Luxembourg City',
                osmCountryCode: 'LU',
            }),
            hamburg,
            countries,
            now,
        );

        expect(props).toMatchObject({
            city: 'Luxembourg City',
            geonamesCity: 'Hamburg',
            countryCode: 'LU',
            country: 'Luxembourg',
            name: 'Cactus',
            nameSource: 'osm',
        });
        expect(props).not.toHaveProperty('sourceName');
    });

    it('clears earlier values when nothing is near', () => {
        expect(buildOfflineGeocodeProps(place(), undefined, countries, now)).toMatchObject({
            geonamesCity: null,
            city: null,
            countryCode: null,
            timezone: null,
        });
    });
});

describe('buildRefinementProps', () => {
    it('stores the OSM details, the refined position and the chosen name', () => {
        const props = buildRefinementProps(
            place({ name: 'Rathaus', geonamesCity: 'Hamburg' }),
            {
                osmFound: true,
                osmDisplayName: 'Rathausmarkt 1, Hamburg',
                road: 'Rathausmarkt',
                houseNumber: '1',
                osmCity: 'Hamburg',
                osmType: 'node',
                osmId: 1,
            },
            now,
        );

        expect(props).toMatchObject({
            osmFound: true,
            osmName: null,
            road: 'Rathausmarkt',
            houseNumber: '1',
            postcode: null,
            refinedAt: now.toISOString(),
            refinedLatitude: 53.55,
            refinedLongitude: 9.99,
            city: 'Hamburg',
            sourceName: 'Rathaus',
            name: 'Rathaus',
            nameSource: 'source',
        });
    });

    it('names an unnamed place after its address and keeps the GeoNames city when OSM has none', () => {
        expect(
            buildRefinementProps(
                place({ geonamesCity: 'Hamburg' }),
                { osmFound: true, road: 'Rathausmarkt', houseNumber: '1' },
                now,
            ),
        ).toMatchObject({ name: 'Rathausmarkt 1', nameSource: 'address', city: 'Hamburg' });
    });

    it('marks a place without OSM result as refined', () => {
        expect(buildRefinementProps(place(), { osmFound: false }, now)).toMatchObject({
            osmFound: false,
            refinedAt: now.toISOString(),
            osmDisplayName: null,
        });
    });
});

describe('selectPlacesToRefine', () => {
    const refined = {
        refinedAt: '2026-10-01T00:00:00.000Z',
        refinedLatitude: 53.55,
        refinedLongitude: 9.99,
    };

    it('picks unrefined places, most visited first, up to maxPlaces', () => {
        const places = [
            place({ id: 'a', visitCount: 1 }),
            place({ id: 'b', visitCount: 10, ...refined }),
            place({ id: 'c', visitCount: 5 }),
            place({ id: 'd', visitCount: 7 }),
        ];

        const result = selectPlacesToRefine(places, { now, movedMeters: 100, maxPlaces: 2 });

        expect(result.selected.map((selected) => selected.id)).toEqual(['d', 'c']);
        expect(result.pending).toBe(3);
    });

    it('refreshes old refinements only with refreshDays, and moved places always', () => {
        const old = place(refined);

        expect(needsRefinement(old, { now, movedMeters: 100 })).toBe(false);
        expect(needsRefinement(old, { now, movedMeters: 100, refreshDays: 30 })).toBe(false);
        expect(needsRefinement(old, { now, movedMeters: 100, refreshDays: 7 })).toBe(true);
        expect(needsRefinement(place({ ...refined, latitude: 53.552 }), { now, movedMeters: 100 })).toBe(true);
    });
});
