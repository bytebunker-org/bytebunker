import type { LatLng } from './geo.util.js';

const EARTH_RADIUS_KM = 6371.0088;
const DEGREES_TO_RADIANS = Math.PI / 180;

/** One row of the GeoNames `citiesN` dump, reduced to what reverse geocoding needs. */
export interface GeoNamesCity {
    geonameId: number;
    name: string;
    latitude: number;
    longitude: number;
    featureCode: string;
    countryCode: string;
    admin1Code: string;
    population: number;
    timezone: string;
}

/**
 * Feature codes that are not a place to name a location after: sections of a populated place (city districts listed
 * next to their city), historical, abandoned and destroyed places.
 */
const EXCLUDED_FEATURE_CODES = new Set(['PPLX', 'PPLH', 'PPLQ', 'PPLW', 'PPLCH']);

/**
 * Parses one tab separated line of `cities1000.txt` (see https://download.geonames.org/export/dump/readme.txt).
 * Returns undefined for malformed lines and excluded feature codes.
 */
export function parseGeoNamesCityLine(line: string): GeoNamesCity | undefined {
    const columns = line.split('\t');

    if (columns.length < 18) {
        return undefined;
    }

    const latitude = Number(columns[4]);
    const longitude = Number(columns[5]);
    const featureCode = columns[7] ?? '';

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || EXCLUDED_FEATURE_CODES.has(featureCode)) {
        return undefined;
    }

    return {
        geonameId: Number(columns[0]),
        name: columns[1] ?? '',
        latitude,
        longitude,
        featureCode,
        countryCode: columns[8] ?? '',
        admin1Code: columns[10] ?? '',
        population: Number(columns[14]) || 0,
        timezone: columns[17] ?? '',
    };
}

export function parseGeoNamesCities(text: string): GeoNamesCity[] {
    const cities: GeoNamesCity[] = [];

    for (const line of text.split('\n')) {
        const city = line ? parseGeoNamesCityLine(line) : undefined;

        if (city?.name) {
            cities.push(city);
        }
    }

    return cities;
}

/** `countryInfo.txt`: ISO code → English country name. Comment lines start with `#`. */
export function parseCountryInfo(text: string): Map<string, string> {
    const countries = new Map<string, string>();

    for (const line of text.split('\n')) {
        if (!line || line.startsWith('#')) {
            continue;
        }

        const columns = line.split('\t');

        if (columns[0] && columns[4]) {
            countries.set(columns[0], columns[4]);
        }
    }

    return countries;
}

/** `admin1CodesASCII.txt`: `CC.code` (e.g. `DE.02`) → name of the first-level division (state, prefecture …). */
export function parseAdmin1Codes(text: string): Map<string, string> {
    const admin1 = new Map<string, string>();

    for (const line of text.split('\n')) {
        const columns = line.split('\t');

        if (columns[0] && columns[1]) {
            admin1.set(columns[0], columns[1].trim());
        }
    }

    return admin1;
}

export interface NearestCity {
    city: GeoNamesCity;
    distanceKm: number;
}

/**
 * Static 3d-tree over the cities' unit vectors: nearest-neighbour and radius queries in microseconds, without special
 * cases at the antimeridian or near the poles. Chord distance between unit vectors grows monotonically with the
 * great-circle distance, so the tree can compare chords and convert only the answer to kilometres.
 */
export class CityIndex {
    private readonly xs: Float64Array;
    private readonly ys: Float64Array;
    private readonly zs: Float64Array;
    /** Tree order: the subtree [lo, hi) has its splitting point at (lo + hi) >> 1. */
    private readonly order: Int32Array;

    constructor(private readonly cities: GeoNamesCity[]) {
        const count = cities.length;
        this.xs = new Float64Array(count);
        this.ys = new Float64Array(count);
        this.zs = new Float64Array(count);
        this.order = new Int32Array(count);

        for (const [index, city] of cities.entries()) {
            const [x, y, z] = toUnitVector(city);
            this.xs[index] = x;
            this.ys[index] = y;
            this.zs[index] = z;
            this.order[index] = index;
        }

        this.build(0, count, 0);
    }

    public get size(): number {
        return this.cities.length;
    }

    public nearest(point: LatLng): NearestCity | undefined {
        if (this.cities.length === 0) {
            return undefined;
        }

        const [x, y, z] = toUnitVector(point);
        const best = { index: -1, chordSquared: Infinity };
        this.searchNearest(0, this.cities.length, 0, x, y, z, best);
        const city = this.cities[best.index]!;

        return { city, distanceKm: chordSquaredToKm(best.chordSquared) };
    }

    /** All cities within `radiusKm` (unordered). */
    public within(point: LatLng, radiusKm: number): NearestCity[] {
        const [x, y, z] = toUnitVector(point);
        const maxChord = 2 * Math.sin(Math.min(Math.PI, radiusKm / EARTH_RADIUS_KM) / 2);
        const found: NearestCity[] = [];
        this.searchWithin(0, this.cities.length, 0, x, y, z, maxChord * maxChord, found);

        return found;
    }

    private coordinate(axis: number, index: number): number {
        return axis === 0 ? this.xs[index]! : axis === 1 ? this.ys[index]! : this.zs[index]!;
    }

    private build(lo: number, hi: number, depth: number): void {
        if (hi - lo <= 1) {
            return;
        }

        const axis = depth % 3;
        const mid = (lo + hi) >> 1;
        this.select(lo, hi - 1, mid, axis);
        this.build(lo, mid, depth + 1);
        this.build(mid + 1, hi, depth + 1);
    }

    /** Quickselect: rearranges order[left..right] so order[k] holds the element of rank k along `axis`. */
    private select(left: number, right: number, k: number, axis: number): void {
        const order = this.order;

        while (right > left) {
            const pivot = this.coordinate(axis, order[(left + right) >> 1]!);
            let i = left;
            let j = right;

            while (i <= j) {
                while (this.coordinate(axis, order[i]!) < pivot) i++;
                while (this.coordinate(axis, order[j]!) > pivot) j--;

                if (i <= j) {
                    const swap = order[i]!;
                    order[i] = order[j]!;
                    order[j] = swap;
                    i++;
                    j--;
                }
            }

            if (k <= j) {
                right = j;
            } else if (k >= i) {
                left = i;
            } else {
                return;
            }
        }
    }

    private searchNearest(
        lo: number,
        hi: number,
        depth: number,
        x: number,
        y: number,
        z: number,
        best: { index: number; chordSquared: number },
    ): void {
        if (hi <= lo) {
            return;
        }

        const mid = (lo + hi) >> 1;
        const index = this.order[mid]!;
        const dx = this.xs[index]! - x;
        const dy = this.ys[index]! - y;
        const dz = this.zs[index]! - z;
        const chordSquared = dx * dx + dy * dy + dz * dz;

        if (chordSquared < best.chordSquared) {
            best.index = index;
            best.chordSquared = chordSquared;
        }

        const axis = depth % 3;
        const diff = (axis === 0 ? x : axis === 1 ? y : z) - this.coordinate(axis, index);
        const [first, second] =
            diff < 0
                ? [
                      [lo, mid],
                      [mid + 1, hi],
                  ]
                : [
                      [mid + 1, hi],
                      [lo, mid],
                  ];

        this.searchNearest(first[0]!, first[1]!, depth + 1, x, y, z, best);

        if (diff * diff < best.chordSquared) {
            this.searchNearest(second[0]!, second[1]!, depth + 1, x, y, z, best);
        }
    }

    private searchWithin(
        lo: number,
        hi: number,
        depth: number,
        x: number,
        y: number,
        z: number,
        maxChordSquared: number,
        found: NearestCity[],
    ): void {
        if (hi <= lo) {
            return;
        }

        const mid = (lo + hi) >> 1;
        const index = this.order[mid]!;
        const dx = this.xs[index]! - x;
        const dy = this.ys[index]! - y;
        const dz = this.zs[index]! - z;
        const chordSquared = dx * dx + dy * dy + dz * dz;

        if (chordSquared <= maxChordSquared) {
            found.push({ city: this.cities[index]!, distanceKm: chordSquaredToKm(chordSquared) });
        }

        const axis = depth % 3;
        const diff = (axis === 0 ? x : axis === 1 ? y : z) - this.coordinate(axis, index);

        if (diff < 0 || diff * diff <= maxChordSquared) {
            this.searchWithin(lo, mid, depth + 1, x, y, z, maxChordSquared, found);
        }

        if (diff >= 0 || diff * diff <= maxChordSquared) {
            this.searchWithin(mid + 1, hi, depth + 1, x, y, z, maxChordSquared, found);
        }
    }
}

function toUnitVector(point: LatLng): [number, number, number] {
    const lat = point.latitude * DEGREES_TO_RADIANS;
    const lng = point.longitude * DEGREES_TO_RADIANS;
    const cosLat = Math.cos(lat);

    return [cosLat * Math.cos(lng), cosLat * Math.sin(lng), Math.sin(lat)];
}

function chordSquaredToKm(chordSquared: number): number {
    return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(chordSquared) / 2));
}

export interface GeoNamesLookups {
    index: CityIndex;
    /** ISO country code → English name. */
    countries: Map<string, string>;
    /** `CC.admin1` → name. */
    admin1: Map<string, string>;
}

export interface OfflineGeocode {
    geonamesId: number;
    /** Nearest populated place (cities1000: population ≥ 1000 or seat of an administrative division). */
    geonamesCity: string;
    /** Most populous city of the same country nearby, for naming trips ("Munich" rather than "Garching"). */
    metroCity?: string;
    admin1?: string;
    countryCode: string;
    country?: string;
    /** IANA timezone of the nearest place. */
    timezone?: string;
    cityDistanceKm: number;
}

export interface OfflineGeocodeOptions {
    /** Beyond this distance to the nearest place, nothing is returned (open sea, remote areas). Default 100. */
    maxCityDistanceKm?: number;
    /** Radius for {@link OfflineGeocode.metroCity}. Default 25. */
    metroRadiusKm?: number;
    /** Minimum population for {@link OfflineGeocode.metroCity}. Default 100,000. */
    metroMinPopulation?: number;
}

export function reverseGeocodeOffline(
    lookups: GeoNamesLookups,
    point: LatLng,
    options: OfflineGeocodeOptions = {},
): OfflineGeocode | undefined {
    const { maxCityDistanceKm = 100, metroRadiusKm = 25, metroMinPopulation = 100_000 } = options;
    const nearest = lookups.index.nearest(point);

    if (!nearest || nearest.distanceKm > maxCityDistanceKm) {
        return undefined;
    }

    const { city } = nearest;
    const metro = lookups.index
        .within(point, metroRadiusKm)
        .filter(
            (candidate) =>
                candidate.city.countryCode === city.countryCode && candidate.city.population >= metroMinPopulation,
        )
        .sort((a, b) => b.city.population - a.city.population || a.distanceKm - b.distanceKm)[0];
    const admin1 = city.admin1Code ? lookups.admin1.get(`${city.countryCode}.${city.admin1Code}`) : undefined;
    const country = lookups.countries.get(city.countryCode);

    return {
        geonamesId: city.geonameId,
        geonamesCity: city.name,
        ...(metro ? { metroCity: metro.city.name } : {}),
        ...(admin1 ? { admin1 } : {}),
        countryCode: city.countryCode,
        ...(country ? { country } : {}),
        ...(city.timezone ? { timezone: city.timezone } : {}),
        cityDistanceKm: Math.round(nearest.distanceKm * 100) / 100,
    };
}
