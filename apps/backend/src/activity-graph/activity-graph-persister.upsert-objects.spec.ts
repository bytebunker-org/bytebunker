import { beforeEach, describe, expect, it } from 'vitest';
import type { EntityManager } from '@mikro-orm/postgresql';
import { Neode } from '@bytebunker/neode';
import type { QueryResult } from 'neo4j-driver';
import type { ASObject } from '@bytebunker/event-schema';
import { ActivityGraphPersisterService } from './activity-graph-persister.service.js';
import { registerGraphSchemas } from './schema/graph-schema.constant.js';
import type { NodeStableKeyIndexService, NodeStableKeyRow } from './node-stable-key-index.service.js';
import { ACTIVITY_GRAPH_CHUNK_SIZE } from './activity-graph.constant.js';

interface CapturedQuery {
    query: string;
    rows: { id: string; props: Record<string, unknown> }[];
    provenance: Record<string, unknown>;
}

class FakeNodeStableKeyIndexService {
    public readonly store = new Map<string, string>();

    public readonly insertedRows: NodeStableKeyRow[] = [];

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
            this.insertedRows.push(row);

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

function createMyHubPerson(id: number, emails: string[] = [], extra: Record<string, unknown> = {}): ASObject {
    return {
        '@type': 'Person',
        '@secondaryTypes': ['MyHubPerson'],
        stableKeys: [`person:myhub:${id}`, ...emails.map((email) => `person:email:${email}`)],
        name: `Person ${id}`,
        myHubId: id,
        ...extra,
    } as unknown as ASObject;
}

describe('ActivityGraphPersisterService.upsertObjects', () => {
    let neode: Neode;
    let capturedQueries: CapturedQuery[];
    let index: FakeNodeStableKeyIndexService;
    let service: ActivityGraphPersisterService;
    let em: EntityManager;

    beforeEach(() => {
        neode = new Neode({ connectionString: 'bolt://127.0.0.1:1', enterprise: false });
        registerGraphSchemas(neode);

        capturedQueries = [];
        neode.writeCypher = ((query: string, params: Record<string, unknown> = {}) => {
            capturedQueries.push({
                query,
                rows: params['rows'] as CapturedQuery['rows'],
                provenance: params['provenance'] as Record<string, unknown>,
            });

            return Promise.resolve({ records: [] } as unknown as QueryResult);
        }) as Neode['writeCypher'];

        index = new FakeNodeStableKeyIndexService();
        em = createFakeEntityManager();
        service = new ActivityGraphPersisterService(neode, index as unknown as NodeStableKeyIndexService);
    });

    it('creates new nodes with all labels and indexes every stable key', async () => {
        const result = await service.upsertObjects(em, [createMyHubPerson(1, ['anna@example.org'])], {
            provenance: { executionId: 42 },
        });

        expect(result).toEqual({ createdCount: 1, updatedCount: 0, conflictingKeyCount: 0, dryRun: false });
        expect(capturedQueries).toHaveLength(1);

        const { query, rows, provenance } = capturedQueries[0]!;
        expect(query).toContain('UNWIND $rows AS row');
        expect(query).toContain('MERGE (node:`ASObject` { id: row.id })');
        expect(query).toContain(':`MyHubPerson`');
        expect(query).toContain(':`Person`');
        expect(provenance['executionId']).toBe(42);

        expect(rows).toHaveLength(1);
        expect(rows[0]!.props).toEqual({ name: 'Person 1', myHubId: 1 });
        expect(index.insertedRows.map((row) => row.stableKey).sort()).toEqual([
            'person:email:anna@example.org',
            'person:myhub:1',
        ]);
        expect(new Set(index.insertedRows.map((row) => row.nodeId))).toEqual(new Set([rows[0]!.id]));
    });

    it('updates the node an importer created and indexes the keys it did not have yet', async () => {
        // A calendar import created a Person node for the attendee's email before the first my-hub sync.
        index.store.set('person:email:anna@example.org', 'attendee-node');

        const result = await service.upsertObjects(em, [
            createMyHubPerson(1, ['anna@example.org', 'anna@work.example']),
        ]);

        expect(result).toMatchObject({ createdCount: 0, updatedCount: 1, conflictingKeyCount: 0 });
        expect(capturedQueries[0]!.rows[0]!.id).toBe('attendee-node');
        expect(index.insertedRows).toEqual([
            { stableKey: 'person:myhub:1', nodeId: 'attendee-node' },
            { stableKey: 'person:email:anna@work.example', nodeId: 'attendee-node' },
        ]);
    });

    it('keeps a key that belongs to another node where it is and counts it as conflicting', async () => {
        index.store.set('person:myhub:1', 'node-1');
        index.store.set('person:email:shared@example.org', 'node-2');

        const result = await service.upsertObjects(em, [createMyHubPerson(1, ['shared@example.org'])]);

        expect(result).toMatchObject({ updatedCount: 1, conflictingKeyCount: 1 });
        expect(capturedQueries[0]!.rows[0]!.id).toBe('node-1');
        expect(index.insertedRows).toEqual([]);
    });

    it('resolves objects sharing a key within one call to the same node', async () => {
        const result = await service.upsertObjects(em, [
            createMyHubPerson(1, ['anna@example.org']),
            createMyHubPerson(1, ['anna@example.org'], { name: 'Anna' }),
        ]);

        expect(result).toMatchObject({ createdCount: 1, updatedCount: 1 });
        const ids = capturedQueries[0]!.rows.map((row) => row.id);
        expect(ids[0]).toBe(ids[1]);
    });

    it('groups objects by label set into one statement each', async () => {
        const place = {
            '@type': 'Place',
            stableKeys: ['test:place:1'],
            name: 'Somewhere',
            tags: ['a', 'b'],
        } as unknown as ASObject;

        await service.upsertObjects(em, [createMyHubPerson(1), createMyHubPerson(2), place]);

        expect(capturedQueries).toHaveLength(2);
        expect(capturedQueries.map((query) => query.rows.length).sort()).toEqual([1, 2]);
        const placeRow = capturedQueries.find((query) => query.query.includes('`Place`'))!.rows[0]!;
        // Nested values are stored as JSON strings, like on activities.
        expect(placeRow.props['tags']).toBe('["a","b"]');
    });

    it('writes nothing in a dry run but still counts', async () => {
        index.store.set('person:myhub:2', 'node-2');

        const result = await service.upsertObjects(em, [createMyHubPerson(1), createMyHubPerson(2)], { dryRun: true });

        expect(result).toEqual({ createdCount: 1, updatedCount: 1, conflictingKeyCount: 0, dryRun: true });
        expect(capturedQueries).toHaveLength(0);
        expect(index.insertedRows).toHaveLength(0);
    });

    it('processes large inputs in chunks and reports progress', async () => {
        const objects = Array.from({ length: ACTIVITY_GRAPH_CHUNK_SIZE + 1 }, (_, index) => createMyHubPerson(index));
        const progress: number[] = [];

        const result = await service.upsertObjects(em, objects, {
            onProgress: ({ processed }) => progress.push(processed),
        });

        expect(result.createdCount).toBe(objects.length);
        expect(progress).toEqual([ACTIVITY_GRAPH_CHUNK_SIZE, ACTIVITY_GRAPH_CHUNK_SIZE + 1]);
        expect(capturedQueries).toHaveLength(2);
    });

    it('rejects unregistered types and objects without a type', async () => {
        await expect(
            service.upsertObjects(em, [{ '@type': 'Unicorn', stableKeys: ['x'] } as unknown as ASObject]),
        ).rejects.toThrow(/Unknown graph node type "Unicorn"/);
        await expect(service.upsertObjects(em, [{ stableKeys: ['x'] } as unknown as ASObject])).rejects.toThrow(
            /need a @type/,
        );
    });
});
