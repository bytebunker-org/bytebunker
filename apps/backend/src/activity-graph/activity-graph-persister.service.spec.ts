import { beforeEach, describe, expect, it } from 'vitest';
import { v4 as uuidV4 } from 'uuid';
import type { EntityManager } from '@mikro-orm/postgresql';
import { Neode } from '@bytebunker/neode';
import type { QueryResult } from 'neo4j-driver';
import { ActivityGraphPersisterService } from './activity-graph-persister.service.js';
import { registerGraphSchemas } from './schema/graph-schema.constant.js';
import type { NodeStableKeyIndexService, NodeStableKeyRow } from './node-stable-key-index.service.js';
import type { ActivityDto } from './dto/activity.dto.js';
import { ACTIVITY_GRAPH_CHUNK_SIZE } from './activity-graph.constant.js';

interface CapturedQuery {
    query: string;
    rows: {
        id: string;
        props: Record<string, unknown>;
        objects: Record<string, { id: string; props: Record<string, unknown> }>;
    }[];
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

const ACTOR_ID = uuidV4();
const EXTENSION_ID = uuidV4();

function createActor(): Record<string, unknown> {
    return { '@id': ACTOR_ID, '@type': 'Person' };
}

function createGenerator(): Record<string, unknown> {
    return { '@id': `extension/${EXTENSION_ID}`, '@type': 'Extension', name: 'youtube' };
}

function createYouTubeVideo(videoId: string): Record<string, unknown> {
    return {
        '@type': 'Video',
        '@secondaryTypes': ['YouTubeVideo'],
        stableKeys: [`youtube:video:${videoId}`],
        name: `Video ${videoId}`,
        videoId,
    };
}

function createViewActivity(index: number, videoId: string): ActivityDto {
    return {
        '@type': 'View',
        '@secondaryTypes': ['YouTubeViewActivity'],
        stableKeys: [`youtube:view:${index}`],
        startTime: `2024-01-0${(index % 9) + 1}T10:00:00.000Z`,
        actor: createActor(),
        generator: createGenerator(),
        object: createYouTubeVideo(videoId),
    } as unknown as ActivityDto;
}

describe('ActivityGraphPersisterService', () => {
    let neode: Neode;
    let capturedQueries: CapturedQuery[];
    let index: FakeNodeStableKeyIndexService;
    let service: ActivityGraphPersisterService;
    let em: EntityManager;

    beforeEach(() => {
        neode = new Neode({ connectionString: 'bolt://127.0.0.1:1', enterprise: false });
        registerGraphSchemas(neode);

        capturedQueries = [];
        // The write path only ever uses `writeCypher`, so capturing it captures everything.
        neode.writeCypher = ((query: string, params: Record<string, unknown> = {}) => {
            capturedQueries.push({ query, rows: params['rows'] as CapturedQuery['rows'] });

            return Promise.resolve({ records: [] } as unknown as QueryResult);
        }) as Neode['writeCypher'];

        index = new FakeNodeStableKeyIndexService();
        em = createFakeEntityManager();
        service = new ActivityGraphPersisterService(neode, index as unknown as NodeStableKeyIndexService);
    });

    it('reuses one node for activities sharing an object by stable key', async () => {
        const activities = [0, 1, 2].map((index) => createViewActivity(index, 'abc'));

        const result = await service.createActivityGraph(em, activities);

        expect(result).toMatchObject({ createdCount: 3, existingCount: 0 });
        expect(capturedQueries).toHaveLength(1);

        const videoNodeIds = new Set(capturedQueries[0]!.rows.map((row) => row.objects['object']!.id));
        expect(videoNodeIds.size).toBe(1);

        const videoKeyRows = index.insertedRows.filter((row) => row.stableKey === 'youtube:video:abc');
        expect(videoKeyRows).toHaveLength(1);
        expect(videoKeyRows[0]!.nodeId).toBe([...videoNodeIds][0]);

        // Three activity stable keys + one object stable key.
        expect(index.insertedRows).toHaveLength(4);
    });

    it('reports already imported activities as existing and writes nothing', async () => {
        const activities = [0, 1, 2].map((index) => createViewActivity(index, 'abc'));

        await service.createActivityGraph(em, activities);
        capturedQueries.length = 0;

        const result = await service.createActivityGraph(
            em,
            [0, 1, 2].map((index) => createViewActivity(index, 'abc')),
        );

        expect(result).toMatchObject({ createdCount: 0, existingCount: 3 });
        expect(capturedQueries).toHaveLength(0);
    });

    it('writes one statement per activity/relationship shape', async () => {
        const viewActivity = createViewActivity(0, 'abc');
        const moveActivity = {
            '@type': 'Move',
            stableKeys: ['google:move:0'],
            startTime: '2024-01-01T10:00:00.000Z',
            actor: createActor(),
            origin: {
                '@type': 'Place',
                stableKeys: ['place:home'],
                name: 'Home',
            },
            target: {
                '@type': 'Place',
                '@secondaryTypes': ['GooglePlace'],
                stableKeys: ['place:work'],
                name: 'Work',
            },
        } as unknown as ActivityDto;

        const result = await service.createActivityGraph(em, [viewActivity, moveActivity]);

        expect(result).toMatchObject({ createdCount: 2, existingCount: 0 });
        expect(capturedQueries).toHaveLength(2);

        const viewQuery = capturedQueries.find((captured) => captured.query.includes('YouTubeViewActivity'))!;
        const moveQuery = capturedQueries.find((captured) => captured.query.includes(':`Move`'))!;

        expect(viewQuery).toBeDefined();
        expect(moveQuery).toBeDefined();

        // Activity node: merged on the ASObject anchor, remaining labels applied via SET.
        expect(viewQuery.query).toContain('MERGE (activity:`ASObject` { id: row.id })');
        expect(viewQuery.query).toContain(
            'SET activity += row.props, activity:`Activity`:`View`:`YouTubeViewActivity`',
        );

        // `actor` is an incoming relationship, everything else points away from the activity.
        expect(viewQuery.query).toContain('MERGE (obj_actor)-[:`ACTED_IN`]->(activity)');
        expect(viewQuery.query).toContain('MERGE (activity)-[:`INVOLVES`]->(obj_object)');
        expect(viewQuery.query).toContain('MERGE (activity)-[:`GENERATED_BY`]->(obj_generator)');

        expect(moveQuery.query).toContain('MERGE (activity)-[:`FROM`]->(obj_origin)');
        expect(moveQuery.query).toContain('MERGE (activity)-[:`TO`]->(obj_target)');
        expect(moveQuery.query).not.toContain('INVOLVES');
    });

    it('adds the labels of every secondary type', async () => {
        await service.createActivityGraph(em, [createViewActivity(0, 'abc')]);

        const query = capturedQueries[0]!.query;

        expect(query).toContain('MERGE (obj_object:`ASObject` { id: row.objects.`object`.id })');
        expect(query).toContain('SET obj_object += row.objects.`object`.props, obj_object:`Video`:`YouTubeVideo`');
        expect(query).toContain('activity:`Activity`:`View`:`YouTubeViewActivity`');
    });

    it('serialises nested object properties and drops the graph-internal keys', async () => {
        const activity = {
            '@type': 'View',
            stableKeys: ['youtube:view:props'],
            startTime: '2024-01-01T10:00:00.000Z',
            waypointPath: { points: [1, 2] },
            emptyValue: undefined,
            actor: createActor(),
        } as unknown as ActivityDto;

        await service.createActivityGraph(em, [activity]);

        const props = capturedQueries[0]!.rows[0]!.props;

        expect(props['waypointPath']).toBe(JSON.stringify({ points: [1, 2] }));
        expect(props).not.toHaveProperty('@type');
        expect(props).not.toHaveProperty('@secondaryTypes');
        expect(props).not.toHaveProperty('stableKeys');
        expect(props).not.toHaveProperty('actor');
        expect(props).not.toHaveProperty('emptyValue');
    });

    it('throws for an unknown relationship property', async () => {
        const activity = {
            '@type': 'View',
            stableKeys: ['youtube:view:unknown-relationship'],
            actor: createActor(),
            somethingElse: { '@type': 'Place', name: 'Nowhere' },
        } as unknown as ActivityDto;

        await expect(service.createActivityGraph(em, [activity])).rejects.toThrow(
            'Unknown relationship on property somethingElse of activity View',
        );
    });

    it('throws for a type that is not a registered graph model', async () => {
        const activity = {
            '@type': 'View',
            '@secondaryTypes': ['NotAModel'],
            stableKeys: ['youtube:view:unknown-type'],
            actor: createActor(),
        } as unknown as ActivityDto;

        await expect(service.createActivityGraph(em, [activity])).rejects.toThrow(
            'Unknown graph node type "NotAModel"',
        );
    });

    it('writes one statement per chunk and keeps object node ids stable across chunks', async () => {
        const activityCount = ACTIVITY_GRAPH_CHUNK_SIZE + 10;
        const activities = Array.from({ length: activityCount }, (_, index) => createViewActivity(index, 'shared'));

        const result = await service.createActivityGraph(em, activities);

        expect(result).toMatchObject({ createdCount: activityCount, existingCount: 0 });
        expect(capturedQueries).toHaveLength(2);
        expect(capturedQueries[0]!.rows).toHaveLength(ACTIVITY_GRAPH_CHUNK_SIZE);
        expect(capturedQueries[1]!.rows).toHaveLength(activityCount - ACTIVITY_GRAPH_CHUNK_SIZE);

        const videoNodeIds = new Set(
            capturedQueries.flatMap((captured) => captured.rows.map((row) => row.objects['object']!.id)),
        );
        expect(videoNodeIds.size).toBe(1);

        expect(index.insertedRows.filter((row) => row.stableKey === 'youtube:video:shared')).toHaveLength(1);
    });
});
