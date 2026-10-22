import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { v4 as uuidV4 } from 'uuid';
import { Neode } from '@bytebunker/neode';
import type { EntityManager } from '@mikro-orm/postgresql';
import { registerGraphSchemas } from '../../../../activity-graph/schema/graph-schema.constant.js';
import type { ActivityGraphService } from '../../../../activity-graph/activity-graph.service.js';
import { NOOP_MODULE_PROGRESS_REPORTER } from '../../../../etl/pipeline/progress/type/module-progress-reporter.interface.js';
import type { PipelineModuleExecutionContext } from '../../../../etl/pipeline/pipeline-module/type/pipeline-module.interface.js';
import type { PipelineModuleIdentifier } from '../../../../etl/pipeline/pipeline-module/type/pipeline-module-identifier.type.js';
import { ActivityInputReaderService } from '../graph/activity-input-reader.service.js';
import { DerivedGraphService } from '../graph/derived-graph.service.js';
import { toPlainNumber } from '../graph/derived-graph.util.js';
import { PlaceGeocodeService } from '../graph/place-geocode.service.js';
import { ConfirmEventsPipelineModule } from './confirm-events.pipeline-module.js';
import { DailySummaryPipelineModule } from './daily-summary.pipeline-module.js';
import { DeriveTripsPipelineModule } from './derive-trips.pipeline-module.js';
import { LinkListensToMovesPipelineModule } from './link-listens-to-moves.pipeline-module.js';

const neo4jUri = process.env['BYTEBUNKER_TEST_NEO4J_URI'];
const neo4jUser = process.env['BYTEBUNKER_TEST_NEO4J_USER'];
const neo4jPassword = process.env['BYTEBUNKER_TEST_NEO4J_PASSWORD'];

/**
 * Everything this spec creates has an id starting with `testRun` (raw nodes, also tagged `testRun`) or is derived
 * under a module id of a made-up extension (`derivedBy` unique to the run), and the reader only sees activities with
 * the `testRun` id prefix - so it can run against a development database without touching real data. The scenario
 * lies in 2099 so derived ids keyed by time or date (travel:…, daily-summary:…) cannot collide with real ones.
 */
const testRun = `derived-activities-spec-${uuidV4()}`;
const testExtension = `test-${Array.from({ length: 12 }, () => String.fromCodePoint(97 + Math.floor(Math.random() * 26))).join('')}`;
const id = (name: string) => `${testRun}:${name}`;
const ownerId = id('owner');

class ScopedReader extends ActivityInputReaderService {
    protected override readonly idPrefix = testRun;
}

describe.skipIf(!neo4jUri)('derived activities (integration)', () => {
    let neode: Neode;
    let reader: ActivityInputReaderService;
    let derived: DerivedGraphService;
    let executionId = 1;

    const activityGraphService = {
        getOwnerActor: () => Promise.resolve({ get: (key: string) => (key === 'id' ? ownerId : undefined) }),
    } as unknown as ActivityGraphService;

    function context<Input>(
        moduleName: string,
        inputData: Input,
        dryRun = false,
    ): PipelineModuleExecutionContext<Input> {
        return {
            em: {} as EntityManager,
            pipelineExecution: { id: executionId++ } as never,
            blueprint: {} as never,
            currentNode: { id: 1, moduleId: `${testExtension}:${moduleName}@1` as PipelineModuleIdentifier } as never,
            inputData,
            progress: NOOP_MODULE_PROGRESS_REPORTER,
            dryRun,
        };
    }

    async function count(cypher: string, params: Record<string, unknown> = {}): Promise<number> {
        const result = await neode.readCypher<{ count: unknown }>(cypher, { testRun, ...params });

        return toPlainNumber(result.records[0]?.get('count'));
    }

    beforeAll(async () => {
        neode = new Neode({
            connectionString: neo4jUri!,
            username: neo4jUser,
            password: neo4jPassword,
            enterprise: false,
        });
        registerGraphSchemas(neode);
        reader = new ScopedReader(neode);
        derived = new DerivedGraphService(neode);

        await neode.writeCypher(
            `CREATE (owner:ASObject:Person { id: $ownerId, testRun: $testRun })
             CREATE (home:ASObject:Place { id: $homeId, testRun: $testRun, name: 'Home', latitude: 49.75, longitude: 6.64 })
             CREATE (paris:ASObject:Place { id: $parisId, testRun: $testRun, name: 'Louvre', latitude: 48.8606, longitude: 2.3376 })
             CREATE (venue:ASObject:Place:IcsLocation { id: $venueId, testRun: $testRun, name: 'Musée du Louvre, Paris' })
             CREATE (owner)-[:HOME_DURING { from: '2099-01-01T00:00:00.000Z', to: '2099-12-31T00:00:00.000Z', testRun: $testRun }]->(home)
             CREATE (a1:ASObject:Activity:Arrive { id: $a1, testRun: $testRun, startTime: '2099-03-01T00:00:00.000Z', endTime: '2099-03-03T08:00:00.000Z', hierarchyLevel: 0 })-[:TO]->(home)
             CREATE (m1:ASObject:Activity:Move { id: $m1, testRun: $testRun, startTime: '2099-03-03T08:00:00.000Z', endTime: '2099-03-03T12:00:00.000Z', activityType: 'IN_TRAIN' })
             CREATE (m1)-[:FROM]->(home), (m1)-[:TO]->(paris)
             CREATE (a2:ASObject:Activity:Arrive { id: $a2, testRun: $testRun, startTime: '2099-03-03T12:00:00.000Z', endTime: '2099-03-05T10:00:00.000Z', hierarchyLevel: 0 })-[:TO]->(paris)
             CREATE (m2:ASObject:Activity:Move { id: $m2, testRun: $testRun, startTime: '2099-03-05T10:00:00.000Z', endTime: '2099-03-05T14:00:00.000Z', activityType: 'IN_TRAIN' })
             CREATE (m2)-[:FROM]->(paris), (m2)-[:TO]->(home)
             CREATE (a3:ASObject:Activity:Arrive { id: $a3, testRun: $testRun, startTime: '2099-03-05T14:00:00.000Z', endTime: '2099-03-06T08:00:00.000Z', hierarchyLevel: 0 })-[:TO]->(home)
             CREATE (:ASObject:Activity:Listen { id: $l1, testRun: $testRun, startTime: '2099-03-03T09:00:00.000Z', endTime: '2099-03-03T09:03:00.000Z' })
             CREATE (e1:ASObject:Activity:Event { id: $e1, testRun: $testRun, summary: 'Museum', startTime: '2099-03-03T12:30:00.000Z', endTime: '2099-03-03T14:00:00.000Z' })-[:TO]->(venue)`,
            {
                testRun,
                ownerId,
                homeId: id('place:home'),
                parisId: id('place:paris'),
                venueId: id('place:venue'),
                a1: id('arrive:1'),
                a2: id('arrive:2'),
                a3: id('arrive:3'),
                m1: id('move:1'),
                m2: id('move:2'),
                l1: id('listen:1'),
                e1: id('event:1'),
            },
        );
    });

    afterAll(async () => {
        if (!neode) {
            return;
        }

        await neode.writeCypher(
            'MATCH (n) WHERE n.testRun = $testRun OR n.derivedBy STARTS WITH $prefix DETACH DELETE n',
            { testRun, prefix: `${testExtension}:` },
        );
        await neode.writeCypher('MATCH ()-[r]->() WHERE r.derivedBy STARTS WITH $prefix DELETE r', {
            prefix: `${testExtension}:`,
        });
        await neode.close();
    });

    it('derives the trip to Paris with destination, actor and included activities, idempotently', async () => {
        const module = new DeriveTripsPipelineModule(
            reader,
            derived,
            activityGraphService,
            new PlaceGeocodeService(neode),
        );

        for (let run = 0; run < 2; run++) {
            const output = await module.executeModule(context('derive-trips', {}));

            expect(output.tripCount).toBe(1);
            expect(output.summary.tripsPerYear).toMatchObject([{ year: 2099, trips: 1, nights: 2 }]);
        }

        const travelId = 'travel:2099-03-03T08:00:00.000Z';
        const result = await neode.readCypher<{ labels: string[]; props: Record<string, unknown> }>(
            'MATCH (t:ASObject { id: $travelId }) RETURN labels(t) AS labels, properties(t) AS props',
            { travelId },
        );

        expect(result.records[0]!.get('labels')).toEqual(expect.arrayContaining(['ASObject', 'Activity', 'Travel']));
        expect(result.records[0]!.get('props')).toMatchObject({
            startTime: '2099-03-03T08:00:00.000Z',
            endTime: '2099-03-05T14:00:00.000Z',
            primaryTransportMode: 'IN_TRAIN',
            name: 'Trip to Louvre',
        });
        await expect(
            count(
                'MATCH (:Person { id: $ownerId })-[:ACTED_IN]->(t:Travel { id: $travelId }) RETURN count(*) AS count',
                {
                    ownerId,
                    travelId,
                },
            ),
        ).resolves.toBe(1);
        await expect(
            count('MATCH (:Travel { id: $travelId })-[r:TO]->(p { id: $parisId }) RETURN count(r) AS count', {
                travelId,
                parisId: id('place:paris'),
            }),
        ).resolves.toBe(1);
        // Arrive in Paris, both moves and the museum event.
        await expect(
            count('MATCH (:Travel { id: $travelId })-[r:INCLUDES]->() RETURN count(r) AS count', { travelId }),
        ).resolves.toBe(4);
    });

    it('links the listen to the train ride', async () => {
        const output = await new LinkListensToMovesPipelineModule(reader, derived).executeModule(
            context('link-listens-to-moves', {}),
        );

        expect(output.summary.perMode).toMatchObject([{ mode: 'IN_TRAIN', listens: 1 }]);
        await expect(
            count('MATCH (:Listen { id: $listenId })-[r:DURING]->(:Move { id: $moveId }) RETURN count(r) AS count', {
                listenId: id('listen:1'),
                moveId: id('move:1'),
            }),
        ).resolves.toBe(1);
    });

    it('confirms the museum event by place name', async () => {
        const output = await new ConfirmEventsPipelineModule(reader, derived, activityGraphService).executeModule(
            context('confirm-events', {}),
        );

        expect(output.summary).toMatchObject({ confirmed: 1, unconfirmed: 0 });
        await expect(
            count(
                'MATCH (:Event { id: $eventId })-[r:CONFIRMED_BY]->(:Arrive { id: $arriveId }) WHERE r.method = $method RETURN count(r) AS count',
                { eventId: id('event:1'), arriveId: id('arrive:2'), method: 'name' },
            ),
        ).resolves.toBe(1);
    });

    it('writes daily summaries keyed by date and updates them in place', async () => {
        const module = new DailySummaryPipelineModule(reader, derived);

        await module.executeModule(context('daily-summary', { timezone: 'Europe/Berlin' }));
        const output = await module.executeModule(context('daily-summary', { timezone: 'Europe/Berlin' }));

        expect(output.summary).toMatchObject({ firstDate: '2099-03-01', lastDate: '2099-03-06' });
        const result = await neode.readCypher<{ props: Record<string, unknown> }>(
            'MATCH (d:DailySummary { id: $dayId }) RETURN properties(d) AS props',
            { dayId: 'daily-summary:2099-03-03' },
        );

        expect(result.records).toHaveLength(1);
        expect(result.records[0]!.get('props')).toMatchObject({
            listenCount: 1,
            moveCount: 1,
            eventCount: 1,
            moveModes: ['IN_TRAIN'],
        });
    });
});
