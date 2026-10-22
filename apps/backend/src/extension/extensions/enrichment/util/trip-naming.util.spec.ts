import { describe, expect, it } from 'vitest';
import { type DestinationGeocode, geocodedTripName } from './trip-naming.util.js';

const HOUR = 3_600_000;

const geocodes = new Map<string, DestinationGeocode>([
    ['narita', { city: 'Narita', metroCity: 'Narita', countryCode: 'JP', country: 'Japan' }],
    ['shinjuku', { city: 'Shinjuku', metroCity: 'Tokyo', countryCode: 'JP', country: 'Japan' }],
    ['shibuya', { city: 'Shibuya', metroCity: 'Tokyo', countryCode: 'JP', country: 'Japan' }],
    ['changi', { city: 'Singapore', metroCity: 'Singapore', countryCode: 'SG', country: 'Singapore' }],
    ['hamburg', { city: 'Hamburg', metroCity: 'Hamburg', countryCode: 'DE', country: 'Germany' }],
    ['rest-stop', { city: 'Soltau', countryCode: 'DE', country: 'Germany' }],
    ['sea', { countryCode: 'NO', country: 'Norway' }],
]);

describe('geocodedTripName', () => {
    it('names a trip abroad after the far city with the most dwell time, with its country', () => {
        expect(
            geocodedTripName(
                [
                    { placeId: 'changi', dwellMs: 3 * HOUR, distanceKm: 10_300 },
                    { placeId: 'narita', dwellMs: 2 * HOUR, distanceKm: 9300 },
                    { placeId: 'shinjuku', dwellMs: 40 * HOUR, distanceKm: 9320 },
                    { placeId: 'shibuya', dwellMs: 30 * HOUR, distanceKm: 9322 },
                ],
                geocodes,
                'DE',
            ),
        ).toBe('Trip to Tokyo, Japan');
    });

    it('leaves the country out within the home country and ignores stops on the way', () => {
        expect(
            geocodedTripName(
                [
                    { placeId: 'rest-stop', dwellMs: 50 * HOUR, distanceKm: 40 },
                    { placeId: 'hamburg', dwellMs: 20 * HOUR, distanceKm: 120 },
                ],
                geocodes,
                'DE',
            ),
        ).toBe('Trip to Hamburg');
    });

    it('falls back to the country, and to nothing without geocoding', () => {
        expect(geocodedTripName([{ placeId: 'sea', dwellMs: HOUR, distanceKm: 900 }], geocodes, 'DE')).toBe(
            'Trip to Norway',
        );
        expect(geocodedTripName([{ placeId: 'unknown', dwellMs: HOUR, distanceKm: 900 }], geocodes, 'DE')).toBe(
            undefined,
        );
        expect(geocodedTripName([], geocodes, 'DE')).toBeUndefined();
    });

    it('adds the country when the home country is unknown', () => {
        expect(geocodedTripName([{ placeId: 'hamburg', dwellMs: HOUR, distanceKm: 300 }], geocodes, undefined)).toBe(
            'Trip to Hamburg, Germany',
        );
    });
});
