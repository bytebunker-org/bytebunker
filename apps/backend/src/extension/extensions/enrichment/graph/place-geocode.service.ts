import { Inject, Injectable } from '@nestjs/common';
import { Neode } from '@bytebunker/neode';
import * as R from 'remeda';
import { NEODE_PROVIDER } from '../../../../activity-graph/graph-database/neode.constant.js';
import { NodeLabelEnum } from '../../../../activity-graph/node-label.enum.js';
import { RelationshipLabelEnum } from '../../../../activity-graph/relationship-label.enum.js';
import { DERIVED_GRAPH_BATCH_SIZE, toPlainNumber } from './derived-graph.util.js';

const PLACE_READ_BATCH_SIZE = 5000;
/** Canonical places per timezone statement: each fans out to all their arrives and moves. */
const TIMEZONE_BATCH_SIZE = 100;

/** A canonical place with its coordinates and whatever geocoding it already has. */
export interface GeocodablePlace {
    id: string;
    latitude: number;
    longitude: number;
    visitCount: number;
    name?: string;
    nameSource?: string;
    sourceName?: string;
    osmName?: string;
    osmCity?: string;
    osmCountryCode?: string;
    geonamesCity?: string;
    countryCode?: string;
    road?: string;
    houseNumber?: string;
    refinedAt?: string;
    refinedLatitude?: number;
    refinedLongitude?: number;
}

/** Geocoding of a canonical place as derive-trips needs it for trip names. */
export interface PlaceGeocode {
    id: string;
    city?: string;
    metroCity?: string;
    countryCode?: string;
    country?: string;
}

export interface PlacePropertyUpdate {
    id: string;
    /** Merged into the node; `null` removes a property. */
    props: Record<string, unknown>;
}

const PLACE_FIELDS = [
    'name',
    'nameSource',
    'sourceName',
    'osmName',
    'osmCity',
    'osmCountryCode',
    'geonamesCity',
    'countryCode',
    'road',
    'houseNumber',
    'refinedAt',
] as const;

/**
 * Reads canonical places for the geocoding modules and merges their results into the nodes in batches. Unlike
 * {@link DerivedGraphService} this never replaces nodes: geocoding only adds properties to consolidate-places' output.
 */
@Injectable()
export class PlaceGeocodeService {
    /** Only places whose id starts with this are read. Empty in production; tests scope reads to their own data. */
    protected readonly idPrefix: string = '';

    constructor(@Inject(NEODE_PROVIDER) private readonly neode: Neode) {}

    public async readPlaces(): Promise<GeocodablePlace[]> {
        const cypher = `MATCH (p:${NodeLabelEnum.AS_OBJECT}:${NodeLabelEnum.CANONICAL_PLACE})
             WHERE p.id > $after${this.idPrefix ? ' AND p.id STARTS WITH $idPrefix' : ''}
             WITH p ORDER BY p.id LIMIT ${PLACE_READ_BATCH_SIZE}
             RETURN p.id AS id, p.latitude AS latitude, p.longitude AS longitude, p.visitCount AS visitCount,
                    p.refinedLatitude AS refinedLatitude, p.refinedLongitude AS refinedLongitude,
                    ${PLACE_FIELDS.map((field) => `p.${field} AS ${field}`).join(', ')}`;
        const places: GeocodablePlace[] = [];
        let after = '';

        for (;;) {
            const result = await this.neode.readCypher(cypher, { after, idPrefix: this.idPrefix });

            for (const record of result.records) {
                const latitude = Number(record.get('latitude'));
                const longitude = Number(record.get('longitude'));
                after = String(record.get('id'));

                if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
                    continue;
                }

                const place: GeocodablePlace = {
                    id: after,
                    latitude,
                    longitude,
                    visitCount: toPlainNumber(record.get('visitCount')),
                };

                for (const field of PLACE_FIELDS) {
                    const value: unknown = record.get(field);

                    if (typeof value === 'string' && value) {
                        place[field] = value;
                    }
                }

                const refinedLatitude: unknown = record.get('refinedLatitude');
                const refinedLongitude: unknown = record.get('refinedLongitude');

                if (typeof refinedLatitude === 'number' && typeof refinedLongitude === 'number') {
                    place.refinedLatitude = refinedLatitude;
                    place.refinedLongitude = refinedLongitude;
                }

                places.push(place);
            }

            if (result.records.length < PLACE_READ_BATCH_SIZE) {
                return places;
            }
        }
    }

    /** Merges the given properties into the canonical places, in batches. Returns the number of places matched. */
    public async updatePlaces(rows: PlacePropertyUpdate[], onProgress?: (written: number) => void): Promise<number> {
        const cypher = `UNWIND $rows AS row
             MATCH (p:${NodeLabelEnum.AS_OBJECT} { id: row.id })
             WHERE p:${NodeLabelEnum.CANONICAL_PLACE}
             SET p += row.props
             RETURN count(p) AS updated`;
        let written = 0;
        let updated = 0;

        for (const chunk of R.chunk(rows, DERIVED_GRAPH_BATCH_SIZE)) {
            const result = await this.neode.writeCypher(cypher, { rows: chunk });
            updated += toPlainNumber(result.records[0]?.get('updated'));
            written += chunk.length;
            onProgress?.(written);
        }

        return updated;
    }

    /**
     * Sets `localTimezone` on the arrives at (TO) and moves starting from (FROM) the raw places of each canonical
     * place. Only activities whose value differs are written, so a re-run touches nothing. Returns activities changed.
     */
    public async copyTimezoneToActivities(
        rows: { id: string; timezone: string }[],
        onProgress?: (places: number) => void,
    ): Promise<number> {
        const cypher = `UNWIND $rows AS row
             MATCH (c:${NodeLabelEnum.AS_OBJECT} { id: row.id })<-[:${RelationshipLabelEnum.SAME_AS}]-(p:${NodeLabelEnum.PLACE})
             MATCH (a:${NodeLabelEnum.ACTIVITY})-[r:${RelationshipLabelEnum.TO}|${RelationshipLabelEnum.FROM}]->(p)
             WHERE ((a:${NodeLabelEnum.ACTIVITY_ARRIVE} AND type(r) = '${RelationshipLabelEnum.TO}')
                 OR (a:${NodeLabelEnum.ACTIVITY_MOVE} AND type(r) = '${RelationshipLabelEnum.FROM}'))
               AND (a.localTimezone IS NULL OR a.localTimezone <> row.timezone)
             SET a.localTimezone = row.timezone
             RETURN count(a) AS updated`;
        let processed = 0;
        let updated = 0;

        for (const chunk of R.chunk(rows, TIMEZONE_BATCH_SIZE)) {
            const result = await this.neode.writeCypher(cypher, { rows: chunk });
            updated += toPlainNumber(result.records[0]?.get('updated'));
            processed += chunk.length;
            onProgress?.(processed);
        }

        return updated;
    }

    /** City and country of the given canonical places (unknown ids are left out). */
    public async readGeocodes(ids: string[]): Promise<Map<string, PlaceGeocode>> {
        const geocodes = new Map<string, PlaceGeocode>();

        for (const chunk of R.chunk([...new Set(ids)], DERIVED_GRAPH_BATCH_SIZE)) {
            const result = await this.neode.readCypher(
                `UNWIND $ids AS id
                 MATCH (p:${NodeLabelEnum.AS_OBJECT} { id: id })
                 WHERE p:${NodeLabelEnum.CANONICAL_PLACE}
                 RETURN p.id AS id, p.city AS city, p.metroCity AS metroCity, p.countryCode AS countryCode,
                        p.country AS country`,
                { ids: chunk },
            );

            for (const record of result.records) {
                const geocode: PlaceGeocode = { id: String(record.get('id')) };

                for (const field of ['city', 'metroCity', 'countryCode', 'country'] as const) {
                    const value: unknown = record.get(field);

                    if (typeof value === 'string' && value) {
                        geocode[field] = value;
                    }
                }

                geocodes.set(geocode.id, geocode);
            }
        }

        return geocodes;
    }
}
