import { Inject, Injectable } from '@nestjs/common';
import { Neode } from '@bytebunker/neode';
import { NEODE_PROVIDER } from '../../../../activity-graph/graph-database/neode.constant.js';
import { NodeLabelEnum } from '../../../../activity-graph/node-label.enum.js';
import { RelationshipLabelEnum } from '../../../../activity-graph/relationship-label.enum.js';
import { haversineMeters, isValidLatLng } from '../util/geo.util.js';
import type { HomePeriod } from '../util/home-timeline.util.js';
import { parseGraphTime } from '../util/role-periods.util.js';
import { toPlainNumber } from './derived-graph.util.js';

/** Activities per read; pages are fetched by id cursor, which the unique `ASObject.id` index serves in order. */
export const ACTIVITY_READ_BATCH_SIZE = 5000;

export interface ArriveInput {
    id: string;
    start: number;
    end: number;
    /** Canonical place id, or the raw place id if the place was not consolidated. */
    placeId?: string;
    canonicalName?: string;
    rawName?: string;
    latitude?: number;
    longitude?: number;
    hierarchyLevel: number;
    semanticType?: string;
}

export interface MoveEndpoint {
    latitude: number;
    longitude: number;
    placeId?: string;
}

export interface MoveInput {
    id: string;
    start: number;
    end: number;
    mode: string;
    origin?: MoveEndpoint;
    target?: MoveEndpoint;
    /** Straight-line distance between origin and target, if both have coordinates. */
    distanceKm?: number;
}

export interface PlayInput {
    id: string;
    kind: 'listen' | 'view';
    start: number;
    end?: number;
    msPlayed?: number;
}

export interface EventInput {
    id: string;
    start: number;
    end?: number;
    summary?: string;
    locationName?: string;
}

export interface TravelInput {
    id: string;
    start: number;
    end: number;
}

/** Called after every page with the number of rows read so far. */
export type ReadProgress = (read: number) => void;

const UNKNOWN_MODE = 'UNKNOWN';

/**
 * Reads the inputs of the derived-activity modules (arrives, moves, plays, events, home periods) as plain arrays, in
 * pages, so the pure functions in `util/` do the actual work.
 */
@Injectable()
export class ActivityInputReaderService {
    /** Only activities whose id starts with this are read. Empty in production; tests scope reads to their own data. */
    protected readonly idPrefix: string = '';

    constructor(@Inject(NEODE_PROVIDER) private readonly neode: Neode) {}

    public async readHomePeriods(ownerId: string): Promise<HomePeriod[]> {
        const result = await this.neode.readCypher(
            `MATCH (:${NodeLabelEnum.PERSON} { id: $ownerId })-[r:${RelationshipLabelEnum.HOME_DURING}]->(p)
             RETURN p.id AS placeId, r.from AS from, r.to AS to, p.latitude AS latitude, p.longitude AS longitude`,
            { ownerId },
        );

        return result.records.flatMap((record) => {
            const period = {
                placeId: String(record.get('placeId')),
                from: parseGraphTime(record.get('from')),
                to: parseGraphTime(record.get('to')),
                latitude: toNumber(record.get('latitude')),
                longitude: toNumber(record.get('longitude')),
            };

            return period.from !== undefined && period.to !== undefined && isValidLatLng(period)
                ? [period as HomePeriod]
                : [];
        });
    }

    public readArrives(onProgress?: ReadProgress): Promise<ArriveInput[]> {
        return this.readPaged(
            NodeLabelEnum.ACTIVITY_ARRIVE,
            `OPTIONAL MATCH (a)-[:${RelationshipLabelEnum.TO}]->(p:${NodeLabelEnum.PLACE})
             OPTIONAL MATCH (p)-[:${RelationshipLabelEnum.SAME_AS}]->(c:${NodeLabelEnum.CANONICAL_PLACE})
             WITH a, head(collect(p)) AS p, head(collect(c)) AS c
             RETURN a.id AS id, a.startTime AS startTime, a.endTime AS endTime, a.hierarchyLevel AS hierarchyLevel,
                    a.semanticType AS semanticType, coalesce(c.id, p.id) AS placeId, c.name AS canonicalName,
                    p.name AS rawName, coalesce(p.latitude, c.latitude) AS latitude,
                    coalesce(p.longitude, c.longitude) AS longitude`,
            (get) => {
                const start = parseGraphTime(get('startTime'));

                if (start === undefined) {
                    return undefined;
                }

                return {
                    id: String(get('id')),
                    start,
                    end: parseGraphTime(get('endTime')) ?? start,
                    ...optionalString('placeId', get('placeId')),
                    ...optionalString('canonicalName', get('canonicalName')),
                    ...optionalString('rawName', get('rawName')),
                    ...coordinates(get('latitude'), get('longitude')),
                    hierarchyLevel: toNumber(get('hierarchyLevel')) ?? 0,
                    ...optionalString('semanticType', get('semanticType')),
                };
            },
            onProgress,
        );
    }

    public readMoves(onProgress?: ReadProgress): Promise<MoveInput[]> {
        return this.readPaged(
            NodeLabelEnum.ACTIVITY_MOVE,
            `OPTIONAL MATCH (a)-[:${RelationshipLabelEnum.FROM}]->(o:${NodeLabelEnum.PLACE})
             OPTIONAL MATCH (a)-[:${RelationshipLabelEnum.TO}]->(t:${NodeLabelEnum.PLACE})
             WITH a, head(collect(o)) AS o, head(collect(t)) AS t
             OPTIONAL MATCH (o)-[:${RelationshipLabelEnum.SAME_AS}]->(oc:${NodeLabelEnum.CANONICAL_PLACE})
             OPTIONAL MATCH (t)-[:${RelationshipLabelEnum.SAME_AS}]->(tc:${NodeLabelEnum.CANONICAL_PLACE})
             WITH a, o, t, head(collect(oc)) AS oc, head(collect(tc)) AS tc
             RETURN a.id AS id, a.startTime AS startTime, a.endTime AS endTime, a.activityType AS activityType,
                    o.latitude AS originLatitude, o.longitude AS originLongitude, coalesce(oc.id, o.id) AS originPlaceId,
                    t.latitude AS targetLatitude, t.longitude AS targetLongitude, coalesce(tc.id, t.id) AS targetPlaceId`,
            (get) => {
                const start = parseGraphTime(get('startTime'));

                if (start === undefined) {
                    return undefined;
                }

                const origin = endpoint(get('originLatitude'), get('originLongitude'), get('originPlaceId'));
                const target = endpoint(get('targetLatitude'), get('targetLongitude'), get('targetPlaceId'));
                const activityType = get('activityType');

                return {
                    id: String(get('id')),
                    start,
                    end: parseGraphTime(get('endTime')) ?? start,
                    mode: typeof activityType === 'string' && activityType ? activityType : UNKNOWN_MODE,
                    ...(origin ? { origin } : {}),
                    ...(target ? { target } : {}),
                    ...(origin && target ? { distanceKm: haversineMeters(origin, target) / 1000 } : {}),
                };
            },
            onProgress,
        );
    }

    /** Listens (Spotify, YouTube Music) and views (YouTube, Spotify videos). */
    public async readPlays(kinds: PlayInput['kind'][], onProgress?: ReadProgress): Promise<PlayInput[]> {
        const plays: PlayInput[] = [];

        for (const kind of kinds) {
            const offset = plays.length;
            const rows = await this.readPaged<PlayInput>(
                kind === 'listen' ? NodeLabelEnum.ACTIVITY_LISTEN : NodeLabelEnum.ACTIVITY_VIEW,
                'RETURN a.id AS id, a.startTime AS startTime, a.endTime AS endTime, a.msPlayed AS msPlayed',
                (get) => {
                    const start = parseGraphTime(get('startTime'));

                    if (start === undefined) {
                        return undefined;
                    }

                    const end = parseGraphTime(get('endTime'));
                    const msPlayed = toNumber(get('msPlayed'));

                    return {
                        id: String(get('id')),
                        kind,
                        start,
                        ...(end === undefined ? {} : { end: Math.max(end, start) }),
                        ...(msPlayed === undefined ? {} : { msPlayed }),
                    };
                },
                onProgress && ((read) => onProgress(offset + read)),
            );

            plays.push(...rows);
        }

        return plays;
    }

    public readEvents(onProgress?: ReadProgress): Promise<EventInput[]> {
        return this.readPaged(
            NodeLabelEnum.ACTIVITY_EVENT,
            `OPTIONAL MATCH (a)-[:${RelationshipLabelEnum.TO}]->(l:${NodeLabelEnum.PLACE})
             WITH a, head(collect(l)) AS l
             RETURN a.id AS id, a.startTime AS startTime, a.endTime AS endTime, a.summary AS summary,
                    l.name AS locationName`,
            (get) => {
                const start = parseGraphTime(get('startTime'));

                if (start === undefined) {
                    return undefined;
                }

                const end = parseGraphTime(get('endTime'));

                return {
                    id: String(get('id')),
                    start,
                    ...(end === undefined ? {} : { end }),
                    ...optionalString('summary', get('summary')),
                    ...optionalString('locationName', get('locationName')),
                };
            },
            onProgress,
        );
    }

    public async readTravels(): Promise<TravelInput[]> {
        const result = await this.neode.readCypher(
            `MATCH (t:${NodeLabelEnum.ACTIVITY_TRAVEL}) RETURN t.id AS id, t.startTime AS startTime, t.endTime AS endTime`,
        );

        return result.records.flatMap((record) => {
            const start = parseGraphTime(record.get('startTime'));
            const end = parseGraphTime(record.get('endTime'));

            return start !== undefined && end !== undefined ? [{ id: String(record.get('id')), start, end }] : [];
        });
    }

    /**
     * Reads all activities with `label` page by page. `projection` continues from `a` (one activity of the page) and
     * must return exactly one row per activity, including `id`. Rows mapped to undefined are skipped.
     */
    private async readPaged<T>(
        label: NodeLabelEnum,
        projection: string,
        map: (get: (key: string) => unknown) => T | undefined,
        onProgress?: ReadProgress,
    ): Promise<T[]> {
        // The page size is inlined because LIMIT needs an integer and JS numbers travel as floats.
        const cypher = `MATCH (a:${NodeLabelEnum.AS_OBJECT}:${label})
             WHERE a.id > $after${this.idPrefix ? ' AND a.id STARTS WITH $idPrefix' : ''}
             WITH a ORDER BY a.id LIMIT ${ACTIVITY_READ_BATCH_SIZE}
             ${projection}`;
        const rows: T[] = [];
        let after = '';
        let read = 0;

        for (;;) {
            const result = await this.neode.readCypher(cypher, { after, idPrefix: this.idPrefix });
            let lastId = after;

            for (const record of result.records) {
                const id = String(record.get('id'));
                lastId = id > lastId ? id : lastId;

                const row = map((key) => record.get(key));

                if (row !== undefined) {
                    rows.push(row);
                }
            }

            read += result.records.length;
            onProgress?.(read);

            if (result.records.length < ACTIVITY_READ_BATCH_SIZE || lastId === after) {
                return rows;
            }

            after = lastId;
        }
    }
}

function toNumber(value: unknown): number | undefined {
    if (value === null || value === undefined || value === '') {
        return undefined;
    }

    const number = toPlainNumber(value);

    return Number.isFinite(number) ? number : undefined;
}

function optionalString<K extends string>(key: K, value: unknown): Partial<Record<K, string>> {
    return typeof value === 'string' && value.trim() ? ({ [key]: value } as Record<K, string>) : {};
}

function coordinates(latitude: unknown, longitude: unknown): { latitude?: number; longitude?: number } {
    const point = { latitude: toNumber(latitude), longitude: toNumber(longitude) };

    return isValidLatLng(point) ? point : {};
}

function endpoint(latitude: unknown, longitude: unknown, placeId: unknown): MoveEndpoint | undefined {
    const point = coordinates(latitude, longitude);

    return isValidLatLng(point)
        ? { ...point, ...(typeof placeId === 'string' && placeId ? { placeId } : {}) }
        : undefined;
}
