import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { v4 as uuidV4 } from 'uuid';
import { Neode } from '@bytebunker/neode';
import type { EntityManager } from '@mikro-orm/postgresql';
import { registerGraphSchemas } from '../../../../activity-graph/schema/graph-schema.constant.js';
import { NodeLabelEnum } from '../../../../activity-graph/node-label.enum.js';
import { NOOP_MODULE_PROGRESS_REPORTER } from '../../../../etl/pipeline/progress/type/module-progress-reporter.interface.js';
import type { PipelineModuleExecutionContext } from '../../../../etl/pipeline/pipeline-module/type/pipeline-module.interface.js';
import type { PipelineModuleIdentifier } from '../../../../etl/pipeline/pipeline-module/type/pipeline-module-identifier.type.js';
import { GEOCODE_PROPERTY_KEYS } from '../geocoding/geocoding.constant.js';
import type { GeoNamesDataService } from '../geocoding/geonames-data.service.js';
import type { NominatimClientService } from '../geocoding/nominatim-client.service.js';
import { DerivedGraphService } from '../graph/derived-graph.service.js';
import { PlaceGeocodeService } from '../graph/place-geocode.service.js';
import { buildDerivedProvenance, toPlainNumber } from '../graph/derived-graph.util.js';
import { CityIndex, type GeoNamesCity, type GeoNamesLookups } from '../util/geonames.util.js';
import type { OsmPlaceDetails } from '../util/nominatim.util.js';
import { GeocodePlacesOfflinePipelineModule } from './geocode-places-offline.pipeline-module.js';
import { RefinePlacesOnlinePipelineModule } from './refine-places-online.pipeline-module.js';

const neo4jUri = process.env['BYTEBUNKER_TEST_NEO4J_URI'];
const neo4jUser = process.env['BYTEBUNKER_TEST_NEO4J_USER'];
const neo4jPassword = process.env['BYTEBUNKER_TEST_NEO4J_PASSWORD'];

/**
 * Everything this spec creates has an id starting with `testRun` and carries `testRun`; the geocoding service only
 * sees canonical places with that id prefix. GeoNames and Nominatim are stubbed, so the spec needs no network.
 */
const testRun = `geocoding-spec-${uuidV4()}`;
const id = (name: string) => `${testRun}:${name}`;

class ScopedPlaceGeocodeService extends PlaceGeocodeService {
    protected override readonly idPrefix = testRun;
}

function city(name: string, latitude: number, longitude: number, countryCode: string, timezone: string): GeoNamesCity {
    return {
        geonameId: name.length,
        name,
        latitude,
        longitude,
        featureCode: 'PPLA',
        countryCode,
        admin1Code: '01',
        population: 1_000_000,
        timezone,
    };
}

const lookups: GeoNamesLookups = {
    index: new CityIndex([
        city('Hamburg', 53.55, 9.99, 'DE', 'Europe/Berlin'),
        city('Tokyo', 35.69, 139.69, 'JP', 'Asia/Tokyo'),
    ]),
    countries: new Map([
        ['DE', 'Germany'],
        ['JP', 'Japan'],
    ]),
    admin1: new Map([['JP.01', 'Tokyo']]),
};

const geoNamesStub = {
    load: () => Promise.resolve({ lookups, info: { dataDir: 'stub', downloaded: [], cityCount: 2, loadMs: 0 } }),
} as unknown as GeoNamesDataService;

describe.skipIf(!neo4jUri)('geocoding modules (integration)', () => {
    let neode: Neode;
    let service: PlaceGeocodeService;
    let executionId = 1;
    const nominatimCalls: string[] = [];
    const nominatimStub = {
        baseUrl: 'stub',
        client: {
            minIntervalMs: 0,
            reverse: (point: { latitude: number }) => {
                nominatimCalls.push(String(point.latitude));
                const details: OsmPlaceDetails =
                    point.latitude > 50
                        ? {
                              osmFound: true,
                              osmName: 'Café Paris',
                              road: 'Rathausstraße',
                              houseNumber: '4',
                              osmCity: 'Hamburg',
                              osmCountryCode: 'DE',
                              osmType: 'node',
                              osmId: 1,
                          }
                        : { osmFound: true, road: 'Shinjuku-dori', osmCity: 'Shinjuku', osmCountryCode: 'JP' };

                return Promise.resolve({ ok: true, details, attempts: 1 });
            },
        },
    } as unknown as NominatimClientService;

    function context<Input>(
        moduleName: string,
        inputData: Input,
        dryRun = false,
    ): PipelineModuleExecutionContext<Input> {
        return {
            em: {} as EntityManager,
            pipelineExecution: { id: executionId++ } as never,
            blueprint: {} as never,
            currentNode: { id: 1, moduleId: `enrichment:${moduleName}@1` as PipelineModuleIdentifier } as never,
            inputData,
            progress: NOOP_MODULE_PROGRESS_REPORTER,
            dryRun,
        };
    }

    async function props(nodeId: string): Promise<Record<string, unknown>> {
        const result = await neode.readCypher('MATCH (n:ASObject { id: $nodeId }) RETURN properties(n) AS props', {
            nodeId,
        });

        return result.records[0]!.get('props') as Record<string, unknown>;
    }

    beforeAll(async () => {
        neode = new Neode({
            connectionString: neo4jUri!,
            username: neo4jUser,
            password: neo4jPassword,
            enterprise: false,
        });
        registerGraphSchemas(neode);
        service = new ScopedPlaceGeocodeService(neode);

        await neode.writeCypher(
            `CREATE (hh:ASObject:CanonicalPlace { id: $hamburgId, testRun: $testRun, name: 'Cafe', sourceName: 'Cafe', latitude: 53.5501, longitude: 9.9901, visitCount: 9 })
             CREATE (tk:ASObject:CanonicalPlace { id: $tokyoId, testRun: $testRun, latitude: 35.6901, longitude: 139.6901, visitCount: 2 })
             CREATE (raw:ASObject:Place { id: $rawId, testRun: $testRun, latitude: 53.5501, longitude: 9.9901 })-[:SAME_AS]->(hh)
             CREATE (:ASObject:Activity:Arrive { id: $arriveId, testRun: $testRun })-[:TO]->(raw)
             CREATE (:ASObject:Activity:Move { id: $moveId, testRun: $testRun })-[:FROM]->(raw)`,
            {
                testRun,
                hamburgId: id('canonical:hamburg'),
                tokyoId: id('canonical:tokyo'),
                rawId: id('raw:hamburg'),
                arriveId: id('arrive'),
                moveId: id('move'),
            },
        );
    });

    afterAll(async () => {
        if (!neode) {
            return;
        }

        await neode.writeCypher('MATCH (n) WHERE n.testRun = $testRun DETACH DELETE n', { testRun });
        await neode.close();
    });

    it('geocodes offline and copies timezones onto activities, writing nothing on a dry run', async () => {
        const module = new GeocodePlacesOfflinePipelineModule(geoNamesStub, service);

        const dry = await module.executeModule(context('geocode-places-offline', {}, true));

        expect(dry.geocodedPlaceCount).toBe(2);
        expect(await props(id('canonical:hamburg'))).not.toHaveProperty('city');

        const output = await module.executeModule(context('geocode-places-offline', {}));

        expect(output.summary.activitiesWithTimezone).toBe(2);
        expect(await props(id('canonical:hamburg'))).toMatchObject({
            city: 'Hamburg',
            countryCode: 'DE',
            country: 'Germany',
            timezone: 'Europe/Berlin',
            name: 'Cafe',
            nameSource: 'source',
        });
        expect(await props(id('canonical:tokyo'))).toMatchObject({ city: 'Tokyo', admin1: 'Tokyo', country: 'Japan' });
        expect(await props(id('arrive'))).toMatchObject({ localTimezone: 'Europe/Berlin' });
        expect(await props(id('move'))).toMatchObject({ localTimezone: 'Europe/Berlin' });

        const again = await module.executeModule(context('geocode-places-offline', {}));

        expect(again.summary.activitiesWithTimezone).toBe(0);
    });

    it('refines online most visited first, resumes with the rest and then has nothing left', async () => {
        const module = new RefinePlacesOnlinePipelineModule(nominatimStub, service);

        const first = await module.executeModule(context('refine-places-online', { maxPlaces: 1 }));

        expect(first.summary).toMatchObject({ refined: 1, pendingBefore: 2, remaining: 1 });
        expect(first.attribution).toBe('Data © OpenStreetMap contributors, ODbL 1.0');
        expect(await props(id('canonical:hamburg'))).toMatchObject({
            name: 'Café Paris',
            nameSource: 'osm',
            sourceName: 'Cafe',
            road: 'Rathausstraße',
            houseNumber: '4',
            city: 'Hamburg',
            osmFound: true,
        });

        const second = await module.executeModule(context('refine-places-online', { maxPlaces: 10 }));

        expect(second.summary).toMatchObject({ refined: 1, remaining: 0 });
        expect(await props(id('canonical:tokyo'))).toMatchObject({
            name: 'Shinjuku-dori',
            nameSource: 'address',
            city: 'Shinjuku',
            geonamesCity: 'Tokyo',
        });

        const third = await module.executeModule(context('refine-places-online', {}));

        expect(third.summary).toMatchObject({ refined: 0, pendingBefore: 0, remaining: 0 });
        expect(nominatimCalls).toHaveLength(2);
    });

    it('keeps the geocoding when consolidation rewrites the canonical place', async () => {
        const derived = new DerivedGraphService(neode);
        const provenance = buildDerivedProvenance('enrichment:consolidate-places@1', 999_999);
        const hamburgId = id('canonical:hamburg');

        await derived.writeNodes(
            NodeLabelEnum.CANONICAL_PLACE,
            [
                {
                    id: hamburgId,
                    props: { testRun, name: 'Cafe', sourceName: 'Cafe', latitude: 53.5501, longitude: 9.9901 },
                },
            ],
            { ...provenance, derivedBy: `test:${testRun}` },
            undefined,
            [],
            GEOCODE_PROPERTY_KEYS,
        );

        expect(await props(hamburgId)).toMatchObject({
            name: 'Cafe',
            osmName: 'Café Paris',
            city: 'Hamburg',
            timezone: 'Europe/Berlin',
            refinedLatitude: 53.5501,
        });

        const geocodes = await service.readGeocodes([hamburgId, id('canonical:tokyo'), id('missing')]);

        expect(geocodes.get(hamburgId)).toMatchObject({ city: 'Hamburg', countryCode: 'DE', country: 'Germany' });
        expect(geocodes.has(id('missing'))).toBe(false);
        expect(
            toPlainNumber(
                (
                    await neode.readCypher('MATCH (n:CanonicalPlace) WHERE n.testRun = $testRun RETURN count(n) AS c', {
                        testRun,
                    })
                ).records[0]!.get('c'),
            ),
        ).toBe(2);
    });
});
