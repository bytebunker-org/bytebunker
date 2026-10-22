import { haversineMeters, isValidLatLng, type LatLng, SpatialGrid } from './geo.util.js';

export interface RawPlacePoint extends LatLng {
    /** Graph node id of the raw place. */
    id: string;
    placeId?: string;
    name?: string;
    /** Arrive activities at this place. */
    arriveCount: number;
    /** Moves starting or ending here. */
    moveCount: number;
}

export interface PlaceClusteringOptions {
    radiusMeters: number;
    /** Clusters wider than this are flagged as ambiguous for review. */
    maxClusterSpanMeters: number;
}

export interface PlaceCluster extends LatLng {
    /** Deterministic id of the canonical place node, see {@link canonicalPlaceId}. */
    id: string;
    /** `place-id`: built around one Google placeId; `coordinates`: density cluster of points without one. */
    kind: 'place-id' | 'coordinates';
    memberIds: string[];
    placeIds: string[];
    name?: string;
    /** Arrives at any member. */
    visitCount: number;
    /** Moves starting or ending at any member. */
    moveCount: number;
    /** Diagonal of the members' bounding box. */
    spanMeters: number;
    ambiguous: boolean;
}

export interface PlaceClusteringResult {
    clusters: PlaceCluster[];
    /** Points without a placeId that joined a placeId cluster. */
    absorbedCount: number;
    /** Points dropped for missing or out of range coordinates. */
    invalidCount: number;
}

/**
 * Consolidates raw place points into canonical places:
 * 1. points sharing a Google placeId form one cluster (distinct placeIds never merge, even when close);
 * 2. a point without placeId joins the nearest placeId cluster that has a member within the radius;
 * 3. the remaining points are density clustered (DBSCAN with min 1 point: connected components of the
 *    "within radius" graph), found through a spatial grid instead of comparing all pairs.
 *
 * Chains of points can make a coordinate cluster wider than the radius; those wider than `maxClusterSpanMeters` are
 * flagged `ambiguous`.
 */
export function clusterPlaces(points: RawPlacePoint[], options: PlaceClusteringOptions): PlaceClusteringResult {
    const valid = points.filter(isValidLatLng);
    const radius = options.radiusMeters;

    // 1. Union by placeId.
    const placeIdGroups = new Map<string, number[]>();
    const anonymous: number[] = [];

    for (const [index, point] of valid.entries()) {
        if (point.placeId) {
            const group = placeIdGroups.get(point.placeId);

            if (group) {
                group.push(index);
            } else {
                placeIdGroups.set(point.placeId, [index]);
            }
        } else {
            anonymous.push(index);
        }
    }

    const groups: { kind: PlaceCluster['kind']; members: number[] }[] = [...placeIdGroups.values()].map((members) => ({
        kind: 'place-id',
        members,
    }));

    // 2. Anonymous points join the placeId cluster with the nearest member within the radius.
    const groupOfPoint = new Map<number, number>();
    const placeIdGrid = new SpatialGrid(radius);

    for (const [groupIndex, group] of groups.entries()) {
        for (const member of group.members) {
            groupOfPoint.set(member, groupIndex);
            placeIdGrid.insert(member, valid[member]!);
        }
    }

    const unabsorbed: number[] = [];
    let absorbedCount = 0;

    for (const index of anonymous) {
        let nearest: { member: number; distance: number } | undefined;

        for (const candidate of placeIdGrid.candidates(valid[index]!)) {
            const distance = haversineMeters(valid[index]!, valid[candidate]!);

            if (distance <= radius && (!nearest || distance < nearest.distance)) {
                nearest = { member: candidate, distance };
            }
        }

        if (nearest) {
            groups[groupOfPoint.get(nearest.member)!]!.members.push(index);
            absorbedCount++;
        } else {
            unabsorbed.push(index);
        }
    }

    // 3. Connected components of the remaining points.
    const unionFind = new UnionFind(unabsorbed.length);
    const anonymousGrid = new SpatialGrid(radius);

    for (const [localIndex, pointIndex] of unabsorbed.entries()) anonymousGrid.insert(localIndex, valid[pointIndex]!);
    for (const [localIndex, pointIndex] of unabsorbed.entries()) {
        for (const candidate of anonymousGrid.candidates(valid[pointIndex]!)) {
            if (
                candidate > localIndex &&
                haversineMeters(valid[pointIndex]!, valid[unabsorbed[candidate]!]!) <= radius
            ) {
                unionFind.union(localIndex, candidate);
            }
        }
    }

    const components = new Map<number, number[]>();

    for (const [localIndex, pointIndex] of unabsorbed.entries()) {
        const root = unionFind.find(localIndex);
        const component = components.get(root);

        if (component) {
            component.push(pointIndex);
        } else {
            components.set(root, [pointIndex]);
        }
    }

    for (const members of components.values()) {
        groups.push({ kind: 'coordinates', members });
    }

    return {
        clusters: groups.map((group) =>
            buildCluster(
                group.kind,
                group.members.map((index) => valid[index]!),
                options,
            ),
        ),
        absorbedCount,
        invalidCount: points.length - valid.length,
    };
}

/**
 * Stable across runs as long as the cluster keeps its defining member: the smallest placeId, or for coordinate
 * clusters the most visited raw place.
 */
export function canonicalPlaceId(kind: PlaceCluster['kind'], members: RawPlacePoint[]): string {
    if (kind === 'place-id') {
        const placeIds = members.flatMap((member) => (member.placeId ? [member.placeId] : [])).sort();

        return `canonical-place:place-id:${placeIds[0]}`;
    }

    const anchor = [...members].sort((a, b) => weight(b) - weight(a) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0]!;

    return `canonical-place:coordinates:${anchor.id}`;
}

function buildCluster(
    kind: PlaceCluster['kind'],
    members: RawPlacePoint[],
    options: PlaceClusteringOptions,
): PlaceCluster {
    let weightSum = 0;
    let latitudeSum = 0;
    let longitudeSum = 0;
    let minLatitude = Infinity;
    let maxLatitude = -Infinity;
    let minLongitude = Infinity;
    let maxLongitude = -Infinity;
    const nameWeights = new Map<string, number>();

    for (const member of members) {
        const memberWeight = weight(member);
        weightSum += memberWeight;
        latitudeSum += member.latitude * memberWeight;
        longitudeSum += member.longitude * memberWeight;
        minLatitude = Math.min(minLatitude, member.latitude);
        maxLatitude = Math.max(maxLatitude, member.latitude);
        minLongitude = Math.min(minLongitude, member.longitude);
        maxLongitude = Math.max(maxLongitude, member.longitude);

        const name = member.name?.trim();

        if (name) {
            nameWeights.set(name, (nameWeights.get(name) ?? 0) + memberWeight);
        }
    }

    const spanMeters = haversineMeters(
        { latitude: minLatitude, longitude: minLongitude },
        { latitude: maxLatitude, longitude: maxLongitude },
    );
    const name = [...nameWeights].sort(([a, wa], [b, wb]) => wb - wa || (a < b ? -1 : a > b ? 1 : 0))[0]?.[0];

    return {
        id: canonicalPlaceId(kind, members),
        kind,
        latitude: latitudeSum / weightSum,
        longitude: longitudeSum / weightSum,
        memberIds: members.map((member) => member.id),
        placeIds: [...new Set(members.flatMap((member) => (member.placeId ? [member.placeId] : [])))].sort(),
        ...(name ? { name } : {}),
        visitCount: members.reduce((sum, member) => sum + member.arriveCount, 0),
        moveCount: members.reduce((sum, member) => sum + member.moveCount, 0),
        spanMeters,
        ambiguous: spanMeters > options.maxClusterSpanMeters,
    };
}

/** Centroid weight: how often the place was used; never zero so unvisited places still count. */
function weight(point: RawPlacePoint): number {
    return Math.max(1, point.arriveCount + point.moveCount);
}

class UnionFind {
    private readonly parent: Int32Array;
    private readonly rank: Uint8Array;

    constructor(size: number) {
        this.parent = new Int32Array(size).map((_, index) => index);
        this.rank = new Uint8Array(size);
    }

    public find(index: number): number {
        let root = index;

        while (this.parent[root] !== root) {
            root = this.parent[root]!;
        }

        let current = index;

        while (this.parent[current] !== root) {
            const next = this.parent[current]!;
            this.parent[current] = root;
            current = next;
        }

        return root;
    }

    public union(a: number, b: number): void {
        const rootA = this.find(a);
        const rootB = this.find(b);

        if (rootA === rootB) {
            return;
        }

        if (this.rank[rootA]! < this.rank[rootB]!) {
            this.parent[rootA] = rootB;
        } else if (this.rank[rootA]! > this.rank[rootB]!) {
            this.parent[rootB] = rootA;
        } else {
            this.parent[rootB] = rootA;
            this.rank[rootA] = this.rank[rootA]! + 1;
        }
    }
}
