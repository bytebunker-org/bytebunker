import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { v4 as uuidV4 } from 'uuid';
import type { EntityManager } from '@mikro-orm/postgresql';
import { Neode } from '@bytebunker/neode';
import { ActivityGraphPersisterService } from './activity-graph-persister.service.js';
import { GraphSchemaBootstrapService } from './graph-database/graph-schema-bootstrap.service.js';
import { registerGraphSchemas } from './schema/graph-schema.constant.js';
import type { NodeStableKeyIndexService, NodeStableKeyRow } from './node-stable-key-index.service.js';
import type { ActivityDto } from './dto/activity.dto.js';

const neo4jUri = process.env['BYTEBUNKER_TEST_NEO4J_URI'];
const neo4jUser = process.env['BYTEBUNKER_TEST_NEO4J_USER'];
const neo4jPassword = process.env['BYTEBUNKER_TEST_NEO4J_PASSWORD'];

/**
 * Every node this spec creates carries a `testRun` property so `afterAll` can delete exactly the
 * nodes it created and nothing else - this may run against a development database.
 */
const testRun = `activity-graph-persister-spec-${uuidV4()}`;

class InMemoryNodeStableKeyIndexService {
    public readonly store = new Map<string, string>();

    public findNodeIds(_em: EntityManager, stableKeys: Iterable<string>): Promise<Map<string, string>> {
        const found = new Map<string, string>();

        for (const stableKey of stableKeys) {
            const nodeId = this.store.get(stableKey);

            if (nodeId) {
                found.set(stableKey, nodeId);
            }
        }

        return Promise.resolve(found);
    }

    public insertMissing(_em: EntityManager, rows: NodeStableKeyRow[]): Promise<void> {
        for (const row of rows) {
            if (!this.store.has(row.stableKey)) {
                this.store.set(row.stableKey, row.nodeId);
            }
        }

        return Promise.resolve();
    }
}

function createFakeEntityManager(): EntityManager {
    const em = {
        fork: () => em,
        transactional: <T>(callback: (em: EntityManager) => Promise<T>): Promise<T> => callback(em),
    } as unknown as EntityManager;

    return em;
}

const actorId = uuidV4();
const extensionId = uuidV4();

function createViewActivity(index: number, videoId: string): ActivityDto {
    return {
        '@type': 'View',
        '@secondaryTypes': ['YouTubeViewActivity'],
        stableKeys: [`${testRun}:view:${index}`],
        testRun,
        startTime: `2024-01-01T1${index}:00:00.000Z`,
        actor: {
            '@id': actorId,
            '@type': 'Person',
            testRun,
            name: 'Integration Test Actor',
        },
        generator: {
            '@id': `extension/${extensionId}`,
            '@type': 'Extension',
            testRun,
            name: 'integration-test-extension',
        },
        object: {
            '@type': 'Video',
            '@secondaryTypes': ['YouTubeVideo'],
            stableKeys: [`${testRun}:video:${videoId}`],
            testRun,
            name: `Video ${videoId}`,
            videoId,
        },
    } as unknown as ActivityDto;
}

describe.skipIf(!neo4jUri)('ActivityGraphPersisterService (integration)', () => {
    let neode: Neode;
    let index: InMemoryNodeStableKeyIndexService;
    let service: ActivityGraphPersisterService;
    let em: EntityManager;

    beforeAll(() => {
        neode = new Neode({
            connectionString: neo4jUri!,
            username: neo4jUser,
            password: neo4jPassword,
            enterprise: false,
        });
        registerGraphSchemas(neode);

        index = new InMemoryNodeStableKeyIndexService();
        em = createFakeEntityManager();
        service = new ActivityGraphPersisterService(neode, index as unknown as NodeStableKeyIndexService);
    });

    afterAll(async () => {
        if (!neode) {
            return;
        }

        await neode.writeCypher('MATCH (n) WHERE n.testRun = $testRun DETACH DELETE n', { testRun });
        await neode.close();
    });

    async function countNodes(labels: string): Promise<number> {
        const result = await neode.readCypher<{ count: { toNumber: () => number } }>(
            `MATCH (n:${labels}) WHERE n.testRun = $testRun RETURN count(n) AS count`,
            { testRun },
        );

        return result.records[0]!.get('count').toNumber();
    }

    async function countRelationships(type: string): Promise<number> {
        const result = await neode.readCypher<{ count: { toNumber: () => number } }>(
            `MATCH (from)-[r:${type}]->(to) WHERE from.testRun = $testRun AND to.testRun = $testRun RETURN count(r) AS count`,
            { testRun },
        );

        return result.records[0]!.get('count').toNumber();
    }

    it('installs the schema idempotently', async () => {
        const bootstrap = new GraphSchemaBootstrapService(neode);

        const first = await bootstrap.installSchema();
        const second = await bootstrap.installSchema();

        expect(first.executed + first.skipped).toBeGreaterThan(0);
        // Nothing may start failing just because the schema is already there.
        expect(second.executed).toBe(first.executed);
    });

    it('creates one shared object node for activities that share a stable key', async () => {
        const result = await service.createActivityGraph(
            em,
            [0, 1, 2].map((index) => createViewActivity(index, 'shared')),
        );

        expect(result).toEqual({ createdCount: 3, existingCount: 0 });

        await expect(countNodes('ASObject:Activity:View:YouTubeViewActivity')).resolves.toBe(3);
        await expect(countNodes('ASObject:Video:YouTubeVideo')).resolves.toBe(1);
        await expect(countNodes('ASObject:Person')).resolves.toBe(1);
        await expect(countNodes('Extension')).resolves.toBe(1);

        await expect(countRelationships('INVOLVES')).resolves.toBe(3);
        await expect(countRelationships('ACTED_IN')).resolves.toBe(3);
        await expect(countRelationships('GENERATED_BY')).resolves.toBe(3);
    });

    it('does not create anything on a re-import of the same activities', async () => {
        const result = await service.createActivityGraph(
            em,
            [0, 1, 2].map((index) => createViewActivity(index, 'shared')),
        );

        expect(result).toEqual({ createdCount: 0, existingCount: 3 });

        await expect(countNodes('ASObject:Activity:View:YouTubeViewActivity')).resolves.toBe(3);
        await expect(countNodes('ASObject:Video:YouTubeVideo')).resolves.toBe(1);
        await expect(countRelationships('INVOLVES')).resolves.toBe(3);
    });

    it('reuses the existing object node for a new activity referencing it', async () => {
        const result = await service.createActivityGraph(em, [createViewActivity(3, 'shared')]);

        expect(result).toEqual({ createdCount: 1, existingCount: 0 });

        await expect(countNodes('ASObject:Activity:View:YouTubeViewActivity')).resolves.toBe(4);
        await expect(countNodes('ASObject:Video:YouTubeVideo')).resolves.toBe(1);
        await expect(countRelationships('INVOLVES')).resolves.toBe(4);
    });
});
