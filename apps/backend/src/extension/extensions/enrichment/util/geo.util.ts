const EARTH_RADIUS_METERS = 6_371_008.8;
const DEGREES_TO_RADIANS = Math.PI / 180;
/** Length of one degree of latitude on the sphere {@link haversineMeters} uses. */
const METERS_PER_DEGREE = EARTH_RADIUS_METERS * DEGREES_TO_RADIANS;
/** Cells near the poles would get arbitrarily wide; nobody's timeline goes there. */
const MAX_ABS_LATITUDE = 89.9;

export interface LatLng {
    latitude: number;
    longitude: number;
}

export function haversineMeters(a: LatLng, b: LatLng): number {
    const dLat = (b.latitude - a.latitude) * DEGREES_TO_RADIANS;
    const dLng = (b.longitude - a.longitude) * DEGREES_TO_RADIANS;
    const h =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(a.latitude * DEGREES_TO_RADIANS) * Math.cos(b.latitude * DEGREES_TO_RADIANS) * Math.sin(dLng / 2) ** 2;

    return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function isValidLatLng(point: Partial<LatLng>): point is LatLng {
    return (
        typeof point.latitude === 'number' &&
        typeof point.longitude === 'number' &&
        Number.isFinite(point.latitude) &&
        Number.isFinite(point.longitude) &&
        Math.abs(point.latitude) <= 90 &&
        Math.abs(point.longitude) <= 180
    );
}

/**
 * Buckets points into cells at least `radiusMeters` wide, so a radius query only looks at the neighbouring cells
 * instead of every point. Rows are latitude bands; each row gets its own longitude step, sized for its poleward edge
 * so a cell is never narrower than the radius. Does not wrap around the antimeridian.
 */
export class SpatialGrid {
    private readonly cells = new Map<string, number[]>();
    private readonly latStep: number;

    constructor(private readonly radiusMeters: number) {
        if (!(radiusMeters > 0)) {
            throw new Error(`radiusMeters must be positive, got ${radiusMeters}`);
        }

        this.latStep = radiusMeters / METERS_PER_DEGREE;
    }

    public insert(index: number, point: LatLng): void {
        const row = this.row(point.latitude);
        const key = `${row}:${Math.floor(point.longitude / this.lngStep(row))}`;
        const cell = this.cells.get(key);

        if (cell) {
            cell.push(index);
        } else {
            this.cells.set(key, [index]);
        }
    }

    /** Indices of points that may lie within the radius of `point` (a superset; filter by distance). */
    public *candidates(point: LatLng): Generator<number> {
        const row = this.row(point.latitude);
        const polewardLatitude = Math.min(MAX_ABS_LATITUDE, Math.abs(point.latitude) + this.latStep);
        const lngRadius = this.latStep / Math.cos(polewardLatitude * DEGREES_TO_RADIANS);

        for (let r = row - 1; r <= row + 1; r++) {
            const step = this.lngStep(r);
            const fromCol = Math.floor((point.longitude - lngRadius) / step);
            const toCol = Math.floor((point.longitude + lngRadius) / step);

            for (let col = fromCol; col <= toCol; col++) {
                const cell = this.cells.get(`${r}:${col}`);

                if (cell) {
                    yield* cell;
                }
            }
        }
    }

    private row(latitude: number): number {
        return Math.floor(latitude / this.latStep);
    }

    private lngStep(row: number): number {
        const polewardEdge = Math.min(
            MAX_ABS_LATITUDE,
            Math.max(Math.abs(row * this.latStep), Math.abs((row + 1) * this.latStep)),
        );

        return this.latStep / Math.cos(polewardEdge * DEGREES_TO_RADIANS);
    }
}
