import { describe, expect, it } from 'vitest';
import { clusterPlaces, type PlaceCluster, type RawPlacePoint } from './place-clustering.util.js';
import { haversineMeters, type LatLng, SpatialGrid } from './geo.util.js';

const options = { radiusMeters: 75, maxClusterSpanMeters: 300 };
const METERS_PER_DEGREE = 111_195;

/** A point `north`/`east` meters away from the origin. */
function offset(origin: LatLng, north: number, east: number): LatLng {
    return {
        latitude: origin.latitude + north / METERS_PER_DEGREE,
        longitude: origin.longitude + east / (METERS_PER_DEGREE * Math.cos((origin.latitude * Math.PI) / 180)),
    };
}

function point(id: string, at: LatLng, extra: Partial<RawPlacePoint> = {}): RawPlacePoint {
    return { id, ...at, arriveCount: 0, moveCount: 0, ...extra };
}

function clusterOf(clusters: PlaceCluster[], memberId: string): PlaceCluster {
    return clusters.find((cluster) => cluster.memberIds.includes(memberId))!;
}

const trier: LatLng = { latitude: 49.7557, longitude: 6.6394 };

describe('haversineMeters', () => {
    it('measures known distances', () => {
        expect(haversineMeters(trier, trier)).toBe(0);
        expect(haversineMeters(trier, offset(trier, 100, 0))).toBeCloseTo(100, 0);
        expect(haversineMeters(trier, offset(trier, 0, 100))).toBeCloseTo(100, 0);
        // Trier -> Luxembourg city, roughly 40 km.
        expect(haversineMeters(trier, { latitude: 49.6116, longitude: 6.1319 })).toBeGreaterThan(38_000);
        expect(haversineMeters(trier, { latitude: 49.6116, longitude: 6.1319 })).toBeLessThan(41_000);
    });
});

describe('SpatialGrid', () => {
    it('finds every neighbour a brute force search finds, at any latitude', () => {
        let seed = 42;
        const random = () => {
            seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
            return seed / 2_147_483_648;
        };

        for (const latitude of [0, 49.75, 70, -60]) {
            const center = { latitude, longitude: 6.6 };
            const points = Array.from({ length: 600 }, () =>
                offset(center, (random() - 0.5) * 2000, (random() - 0.5) * 2000),
            );
            const grid = new SpatialGrid(75);
            for (const [index, p] of points.entries()) grid.insert(index, p);

            for (const [index, p] of points.entries()) {
                const expected = points
                    .map((q, j) => (haversineMeters(p, q) <= 75 ? j : -1))
                    .filter((j) => j >= 0)
                    .sort((a, b) => a - b);
                const found = [...new Set(grid.candidates(p))]
                    .filter((j) => haversineMeters(p, points[j]!) <= 75)
                    .sort((a, b) => a - b);

                expect(found, `point ${index} at latitude ${latitude}`).toEqual(expected);
            }
        }
    });

    it('rejects a non-positive radius', () => {
        expect(() => new SpatialGrid(0)).toThrow();
    });
});

describe('clusterPlaces', () => {
    it('unions places with the same placeId regardless of distance and keeps distinct placeIds apart', () => {
        const { clusters } = clusterPlaces(
            [
                point('a', trier, { placeId: 'P1' }),
                point('b', offset(trier, 500, 0), { placeId: 'P1' }),
                point('c', offset(trier, 10, 0), { placeId: 'P2' }),
            ],
            options,
        );

        expect(clusters).toHaveLength(2);
        expect(clusterOf(clusters, 'a').memberIds.sort()).toEqual(['a', 'b']);
        expect(clusterOf(clusters, 'a').placeIds).toEqual(['P1']);
        expect(clusterOf(clusters, 'a').id).toBe('canonical-place:place-id:P1');
        // 500 m apart: same placeId, but flagged for review.
        expect(clusterOf(clusters, 'a').ambiguous).toBe(true);
        expect(clusterOf(clusters, 'c').memberIds).toEqual(['c']);
    });

    it('lets a placeId cluster absorb anonymous points within the radius, nearest cluster wins', () => {
        const result = clusterPlaces(
            [
                point('cafe', trier, { placeId: 'CAFE' }),
                point('shop', offset(trier, 0, 100), { placeId: 'SHOP' }),
                point('near-cafe', offset(trier, 0, 30)),
                point('near-shop', offset(trier, 0, 70)),
                point('far', offset(trier, 0, 400)),
            ],
            options,
        );

        expect(result.absorbedCount).toBe(2);
        expect(clusterOf(result.clusters, 'near-cafe').id).toBe('canonical-place:place-id:CAFE');
        expect(clusterOf(result.clusters, 'near-shop').id).toBe('canonical-place:place-id:SHOP');
        expect(clusterOf(result.clusters, 'far').kind).toBe('coordinates');
        expect(result.clusters).toHaveLength(3);
    });

    it('density clusters anonymous points by chaining neighbours within the radius', () => {
        // a - b - c are 60 m apart each (a and c 120 m apart), d is 200 m from c.
        const { clusters } = clusterPlaces(
            [
                point('a', trier),
                point('b', offset(trier, 60, 0)),
                point('c', offset(trier, 120, 0)),
                point('d', offset(trier, 320, 0)),
            ],
            options,
        );

        expect(clusters).toHaveLength(2);
        expect(clusterOf(clusters, 'a').memberIds.sort()).toEqual(['a', 'b', 'c']);
        expect(clusterOf(clusters, 'a').spanMeters).toBeCloseTo(120, 0);
        expect(clusterOf(clusters, 'a').ambiguous).toBe(false);
        expect(clusterOf(clusters, 'd').memberIds).toEqual(['d']);
    });

    it('flags chained clusters wider than maxClusterSpanMeters', () => {
        const chain = Array.from({ length: 8 }, (_, index) => point(`p${index}`, offset(trier, index * 70, 0)));
        const { clusters } = clusterPlaces(chain, options);

        expect(clusters).toHaveLength(1);
        expect(clusters[0]!.spanMeters).toBeCloseTo(490, 0);
        expect(clusters[0]!.ambiguous).toBe(true);
    });

    it('weights the centroid by visits and picks the most visited name', () => {
        const home = offset(trier, 0, 0);
        const { clusters } = clusterPlaces(
            [
                point('a', home, { arriveCount: 9, moveCount: 0, name: 'Home' }),
                point('b', offset(trier, 40, 0), { arriveCount: 0, moveCount: 1, name: 'Hauptstraße 1' }),
            ],
            options,
        );

        expect(clusters).toHaveLength(1);
        const [cluster] = clusters;
        expect(cluster!.name).toBe('Home');
        expect(cluster!.visitCount).toBe(9);
        expect(cluster!.moveCount).toBe(1);
        // Weights 9 and 1: the centroid sits 4 m from a.
        expect(haversineMeters(cluster!, home)).toBeCloseTo(4, 0);
        // The id is anchored on the most visited member, so it survives new points joining.
        expect(cluster!.id).toBe('canonical-place:coordinates:a');
    });

    it('drops points without usable coordinates', () => {
        const result = clusterPlaces(
            [
                point('ok', trier),
                point('nan', { latitude: Number.NaN, longitude: 1 }),
                point('range', { latitude: 91, longitude: 1 }),
            ],
            options,
        );

        expect(result.invalidCount).toBe(2);
        expect(result.clusters.flatMap((cluster) => cluster.memberIds)).toEqual(['ok']);
    });

    it('is deterministic and assigns every point exactly once on a larger synthetic city', () => {
        let seed = 7;
        const random = () => {
            seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
            return seed / 2_147_483_648;
        };
        const points: RawPlacePoint[] = [];

        // 300 venues, each with a few GPS-jittered raw places, a third of them carrying a placeId.
        for (let venue = 0; venue < 300; venue++) {
            const center = offset(trier, (random() - 0.5) * 20_000, (random() - 0.5) * 20_000);

            for (let copy = 0; copy < 1 + Math.floor(random() * 4); copy++) {
                points.push(
                    point(`v${venue}-${copy}`, offset(center, (random() - 0.5) * 30, (random() - 0.5) * 30), {
                        ...(venue % 3 === 0 && copy === 0 ? { placeId: `PID${venue}` } : {}),
                        arriveCount: Math.floor(random() * 5),
                    }),
                );
            }
        }

        const first = clusterPlaces(points, options);
        const second = clusterPlaces([...points].reverse(), options);
        const members = first.clusters.flatMap((cluster) => cluster.memberIds);

        expect(new Set(members).size).toBe(points.length);
        expect(members).toHaveLength(points.length);
        expect(first.clusters.length).toBeLessThan(points.length);
        expect(first.clusters.length).toBeLessThanOrEqual(300);
        expect(new Set(second.clusters.map((cluster) => cluster.id))).toEqual(
            new Set(first.clusters.map((cluster) => cluster.id)),
        );
    });
});
