import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { haversineMeters } from './geo.util.js';
import {
    CityIndex,
    type GeoNamesCity,
    type GeoNamesLookups,
    parseAdmin1Codes,
    parseCountryInfo,
    parseGeoNamesCities,
    parseGeoNamesCityLine,
    reverseGeocodeOffline,
} from './geonames.util.js';

function cityLine(
    id: number,
    name: string,
    latitude: number,
    longitude: number,
    countryCode: string,
    admin1: string,
    population: number,
    timezone: string,
    featureCode = 'PPL',
): string {
    return [
        id,
        name,
        name,
        `${name},Alt ${name}`,
        latitude,
        longitude,
        'P',
        featureCode,
        countryCode,
        '',
        admin1,
        '',
        '',
        '',
        population,
        '',
        '10',
        timezone,
        '2024-01-01',
    ].join('\t');
}

const CITIES_TEXT = [
    cityLine(2_911_298, 'Hamburg', 53.550_73, 9.993_02, 'DE', '04', 1_845_229, 'Europe/Berlin', 'PPLA'),
    cityLine(2_867_714, 'Munich', 48.137_43, 11.575_49, 'DE', '02', 1_260_391, 'Europe/Berlin', 'PPLA'),
    cityLine(2_922_582, 'Garching bei München', 48.248_96, 11.651_01, 'DE', '02', 17_000, 'Europe/Berlin'),
    cityLine(1_850_147, 'Tokyo', 35.6895, 139.691_71, 'JP', '40', 8_336_599, 'Asia/Tokyo', 'PPLC'),
    cityLine(1, 'Altona-Altstadt', 53.5475, 9.94, 'DE', '04', 28_000, 'Europe/Berlin', 'PPLX'),
    cityLine(2_988_507, 'Strasbourg', 48.583_92, 7.745_53, 'FR', '44', 290_576, 'Europe/Paris', 'PPLA'),
    cityLine(2_892_874, 'Kehl', 48.572_97, 7.815_23, 'DE', '01', 36_000, 'Europe/Berlin'),
    cityLine(4_031_637, 'Suva', -18.141_61, 178.441_49, 'FJ', '01', 77_366, 'Pacific/Fiji', 'PPLC'),
    cityLine(4_032_402, 'Lambasa', -16.416_67, 179.383_33, 'FJ', '03', 24_187, 'Pacific/Fiji'),
    cityLine(5, 'Taveuni', -16.85, -179.95, 'FJ', '03', 1000, 'Pacific/Fiji'),
    '',
    'not a line',
].join('\n');

const COUNTRY_INFO = [
    '#ISO\tISO3\tISO-Numeric\tfips\tCountry\tCapital',
    'DE\tDEU\t276\tGM\tGermany\tBerlin',
    'JP\tJPN\t392\tJA\tJapan\tTokyo',
    'FR\tFRA\t250\tFR\tFrance\tParis',
].join('\n');

const ADMIN1 = [
    'DE.04\tHamburg\tHamburg\t2911297',
    'DE.02\tBavaria\tBavaria\t2951839',
    'JP.40\tTokyo\tTokyo\t1850144',
].join('\n');

function lookups(): GeoNamesLookups {
    return {
        index: new CityIndex(parseGeoNamesCities(CITIES_TEXT)),
        countries: parseCountryInfo(COUNTRY_INFO),
        admin1: parseAdmin1Codes(ADMIN1),
    };
}

describe('GeoNames parsing', () => {
    it('parses a cities line', () => {
        expect(
            parseGeoNamesCityLine(
                cityLine(1_850_147, 'Tokyo', 35.6895, 139.691_71, 'JP', '40', 8_336_599, 'Asia/Tokyo'),
            ),
        ).toEqual({
            geonameId: 1_850_147,
            name: 'Tokyo',
            latitude: 35.6895,
            longitude: 139.691_71,
            featureCode: 'PPL',
            countryCode: 'JP',
            admin1Code: '40',
            population: 8_336_599,
            timezone: 'Asia/Tokyo',
        });
    });

    it('skips city sections, malformed and empty lines', () => {
        const names = parseGeoNamesCities(CITIES_TEXT).map((city) => city.name);

        expect(names).not.toContain('Altona-Altstadt');
        expect(names).toHaveLength(9);
    });

    it('parses country info and admin1 codes', () => {
        expect(parseCountryInfo(COUNTRY_INFO).get('JP')).toBe('Japan');
        expect(parseCountryInfo(COUNTRY_INFO).has('#ISO')).toBe(false);
        expect(parseAdmin1Codes(ADMIN1).get('DE.02')).toBe('Bavaria');
    });
});

describe('CityIndex', () => {
    it('agrees with a brute-force nearest search', () => {
        const cities: GeoNamesCity[] = [];
        let seed = 42;
        const random = () => {
            seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;

            return seed / 2_147_483_648;
        };

        for (let index = 0; index < 2000; index++) {
            cities.push({
                geonameId: index,
                name: `c${index}`,
                latitude: random() * 170 - 85,
                longitude: random() * 360 - 180,
                featureCode: 'PPL',
                countryCode: 'XX',
                admin1Code: '',
                population: 1000,
                timezone: 'UTC',
            });
        }

        const index = new CityIndex(cities);

        for (let query = 0; query < 200; query++) {
            const point = { latitude: random() * 170 - 85, longitude: random() * 360 - 180 };
            const bruteForce = [...cities].sort((a, b) => haversineMeters(point, a) - haversineMeters(point, b))[0]!;
            const nearest = index.nearest(point)!;

            expect(nearest.city.name).toBe(bruteForce.name);
            expect(nearest.distanceKm).toBeCloseTo(haversineMeters(point, bruteForce) / 1000, 3);

            const radiusKm = 800;
            const within = index
                .within(point, radiusKm)
                .map((found) => found.city.name)
                .sort();
            const expected = cities
                .filter((city) => haversineMeters(point, city) <= radiusKm * 1000)
                .map((city) => city.name)
                .sort();

            expect(within).toEqual(expected);
        }
    });

    it('finds neighbours across the antimeridian', () => {
        const nearest = lookups().index.nearest({ latitude: -16.8, longitude: 179.99 })!;

        expect(nearest.city.name).toBe('Taveuni');
        expect(nearest.distanceKm).toBeLessThan(10);
    });

    it('handles an empty index', () => {
        expect(new CityIndex([]).nearest({ latitude: 0, longitude: 0 })).toBeUndefined();
    });
});

describe('reverseGeocodeOffline', () => {
    it('returns city, state, country and timezone of the nearest place', () => {
        expect(reverseGeocodeOffline(lookups(), { latitude: 35.68, longitude: 139.7 })).toEqual({
            geonamesId: 1_850_147,
            geonamesCity: 'Tokyo',
            metroCity: 'Tokyo',
            admin1: 'Tokyo',
            countryCode: 'JP',
            country: 'Japan',
            timezone: 'Asia/Tokyo',
            cityDistanceKm: expect.closeTo(1.4, 0) as number,
        });
    });

    it('names the nearby big city as metro city, but only within the same country', () => {
        const garching = reverseGeocodeOffline(lookups(), { latitude: 48.25, longitude: 11.65 })!;

        expect(garching.geonamesCity).toBe('Garching bei München');
        expect(garching.metroCity).toBe('Munich');
        expect(garching.admin1).toBe('Bavaria');

        const kehl = reverseGeocodeOffline(lookups(), { latitude: 48.572, longitude: 7.816 })!;

        expect(kehl.geonamesCity).toBe('Kehl');
        expect(kehl.metroCity).toBeUndefined();
    });

    it('returns nothing far away from any place', () => {
        expect(reverseGeocodeOffline(lookups(), { latitude: 0, longitude: -30 })).toBeUndefined();
    });
});

const dataDir = path.resolve(import.meta.dirname, '../../../../../temp/geonames');
const citiesFile = path.join(dataDir, 'cities1000.txt');

describe.skipIf(!existsSync(citiesFile))('reverseGeocodeOffline with the real cities1000 dump', () => {
    it('geocodes thousands of points in well under a second', () => {
        const loadStart = performance.now();
        const real: GeoNamesLookups = {
            index: new CityIndex(parseGeoNamesCities(readFileSync(citiesFile, 'utf8'))),
            countries: parseCountryInfo(readFileSync(path.join(dataDir, 'countryInfo.txt'), 'utf8')),
            admin1: parseAdmin1Codes(readFileSync(path.join(dataDir, 'admin1CodesASCII.txt'), 'utf8')),
        };
        const loadMs = performance.now() - loadStart;

        const queryStart = performance.now();

        for (let index = 0; index < 5000; index++) {
            reverseGeocodeOffline(real, { latitude: 47 + (index % 100) * 0.05, longitude: 6 + index * 0.001 });
        }

        const queryMs = performance.now() - queryStart;

        expect(loadMs).toBeLessThan(10_000);
        expect(queryMs).toBeLessThan(2000);

        const hamburg = reverseGeocodeOffline(real, { latitude: 53.5503, longitude: 9.9925 })!;

        expect(hamburg).toMatchObject({ geonamesCity: 'Hamburg', countryCode: 'DE', country: 'Germany' });
        expect(hamburg.timezone).toBe('Europe/Berlin');

        const shinjuku = reverseGeocodeOffline(real, { latitude: 35.6938, longitude: 139.7034 })!;

        expect(shinjuku).toMatchObject({
            countryCode: 'JP',
            country: 'Japan',
            timezone: 'Asia/Tokyo',
            metroCity: 'Tokyo',
        });

        const singapore = reverseGeocodeOffline(real, { latitude: 1.2834, longitude: 103.8607 })!;

        expect(singapore).toMatchObject({ countryCode: 'SG', timezone: 'Asia/Singapore' });
    });
});
