import { describe, expect, it } from 'vitest';
import type { Neode } from '@bytebunker/neode';
import { DerivedGraphService } from './derived-graph.service.js';
import {
    buildDeleteStaleDerivedNodesCypher,
    buildDerivedProvenance,
    buildWriteDerivedNodesCypher,
    DERIVED_GRAPH_BATCH_SIZE,
    toPlainNumber,
} from './derived-graph.util.js';
import { NodeLabelEnum } from '../../../../activity-graph/node-label.enum.js';
import { RelationshipLabelEnum } from '../../../../activity-graph/relationship-label.enum.js';

interface RecordedQuery {
    kind: 'read' | 'write';
    query: string;
    params: Record<string, unknown>;
}

/** Records every statement; delete statements report `deletes[i]` deleted rows on their i-th call. */
function createFakeNeode(options: { deletes?: number[]; count?: number } = {}) {
    const queries: RecordedQuery[] = [];
    const deletes = [...(options.deletes ?? [])];
    const result = (key: string, value: unknown) => ({
        records: [{ get: (k: string) => (k === key ? value : undefined) }],
    });

    const neode = {
        writeCypher: (query: string, params: Record<string, unknown> = {}) => {
            queries.push({ kind: 'write', query, params });

            return Promise.resolve(
                query.includes('DELETE') ? result('deleted', deletes.shift() ?? 0) : { records: [] },
            );
        },
        readCypher: (query: string, params: Record<string, unknown> = {}) => {
            queries.push({ kind: 'read', query, params });

            return Promise.resolve(result('count', options.count ?? 0));
        },
    };

    return { neode: neode as unknown as Neode, queries };
}

const provenance = buildDerivedProvenance('enrichment:consolidate-places@2', 17, new Date('2026-10-22T03:30:00Z'));
const scope = { nodeLabels: [NodeLabelEnum.CANONICAL_PLACE], relationshipTypes: [RelationshipLabelEnum.SAME_AS] };

describe('buildDerivedProvenance', () => {
    it('drops the version from derivedBy so a new module version replaces the old output', () => {
        expect(provenance).toEqual({
            derived: true,
            derivedBy: 'enrichment:consolidate-places',
            derivedVersion: 2,
            importExecutionId: 17,
            derivedAt: '2026-10-22T03:30:00.000Z',
        });
    });
});

describe('derived graph cypher', () => {
    it('merges nodes on the ASObject id and replaces all their properties', () => {
        const cypher = buildWriteDerivedNodesCypher(NodeLabelEnum.CANONICAL_PLACE);

        expect(cypher).toContain('UNWIND $rows AS row');
        expect(cypher).toContain('MERGE (n:`ASObject` { id: row.id })');
        expect(cypher).toContain('SET n = row.props, n += $provenance, n.id = row.id, n:`CanonicalPlace`');
        expect(cypher).toContain('MERGE (n)-[:`GENERATED_BY`]->(generator)');
    });

    it('only deletes nodes the current execution did not write, in limited batches', () => {
        const cypher = buildDeleteStaleDerivedNodesCypher(NodeLabelEnum.CANONICAL_PLACE);

        expect(cypher).toContain('n.importExecutionId <> $executionId');
        expect(cypher).toContain(`LIMIT ${DERIVED_GRAPH_BATCH_SIZE}`);
        expect(cypher).toContain('DETACH DELETE n');
    });
});

describe('DerivedGraphService.replaceDerived', () => {
    it('deletes old relationships, then writes, then sweeps stale nodes', async () => {
        const { neode, queries } = createFakeNeode({ deletes: [5, 2] });
        const service = new DerivedGraphService(neode);
        const steps: string[] = [];

        const result = await service.replaceDerived(provenance, scope, {
            dryRun: false,
            write: () => {
                steps.push(`write after ${queries.length} statements`);
                return Promise.resolve();
            },
        });

        expect(queries.map((q) => q.query.split('\n')[0])).toEqual([
            'MATCH ()-[r:`SAME_AS`]->()',
            'MATCH (n:`CanonicalPlace`)',
        ]);
        expect(steps).toEqual(['write after 1 statements']);
        expect(queries[0]!.params).toEqual({ derivedBy: 'enrichment:consolidate-places' });
        expect(queries[1]!.params).toEqual({ derivedBy: 'enrichment:consolidate-places', executionId: 17 });
        expect(result).toEqual({ replacedRelationships: 5, replacedNodes: 2, dryRun: false });
    });

    it('keeps deleting while a batch comes back full', async () => {
        const { neode, queries } = createFakeNeode({
            deletes: [DERIVED_GRAPH_BATCH_SIZE, DERIVED_GRAPH_BATCH_SIZE, 3, 0],
        });
        const service = new DerivedGraphService(neode);

        const result = await service.replaceDerived(provenance, scope, {
            dryRun: false,
            write: () => Promise.resolve(),
        });

        expect(result.replacedRelationships).toBe(2 * DERIVED_GRAPH_BATCH_SIZE + 3);
        expect(result.replacedNodes).toBe(0);
        expect(queries.filter((q) => q.query.includes('SAME_AS'))).toHaveLength(3);
    });

    it('writes and deletes nothing on a dry run, but reports what it would replace', async () => {
        const { neode, queries } = createFakeNeode({ count: 42 });
        const service = new DerivedGraphService(neode);
        let wrote = false;

        const result = await service.replaceDerived(provenance, scope, {
            dryRun: true,
            write: () => {
                wrote = true;
                return Promise.resolve();
            },
        });

        expect(wrote).toBe(false);
        expect(queries.every((q) => q.kind === 'read')).toBe(true);
        expect(result).toEqual({ replacedNodes: 42, replacedRelationships: 42, dryRun: true });
    });

    it('is idempotent: a second run issues the same statements', async () => {
        const run = async () => {
            const { neode, queries } = createFakeNeode();
            const service = new DerivedGraphService(neode);

            await service.replaceDerived(provenance, scope, {
                dryRun: false,
                write: async () => {
                    await service.writeNodes(
                        NodeLabelEnum.CANONICAL_PLACE,
                        [{ id: 'canonical-place:place-id:P1', props: { name: 'Home' } }],
                        provenance,
                    );
                    await service.writeRelationships(
                        RelationshipLabelEnum.SAME_AS,
                        [{ fromId: 'raw-1', toId: 'canonical-place:place-id:P1', props: {} }],
                        provenance,
                    );
                },
            });

            return queries;
        };

        expect(await run()).toEqual(await run());
    });
});

describe('DerivedGraphService writes', () => {
    it('chunks rows and stamps provenance and the generator', async () => {
        const { neode, queries } = createFakeNeode();
        const service = new DerivedGraphService(neode);
        const rows = Array.from({ length: DERIVED_GRAPH_BATCH_SIZE * 2 + 1 }, (_, index) => ({
            id: `n${index}`,
            props: {},
        }));
        const progress: number[] = [];

        await service.writeNodes(NodeLabelEnum.CANONICAL_PLACE, rows, provenance, (written) => progress.push(written));

        const unwinds = queries.filter((q) => q.query.startsWith('UNWIND'));
        expect(queries[0]!.query).toContain('MERGE (generator:Extension');
        expect(unwinds.map((q) => (q.params['rows'] as unknown[]).length)).toEqual([
            DERIVED_GRAPH_BATCH_SIZE,
            DERIVED_GRAPH_BATCH_SIZE,
            1,
        ]);
        expect(unwinds[0]!.params['provenance']).toBe(provenance);
        expect(progress).toEqual([DERIVED_GRAPH_BATCH_SIZE, 2 * DERIVED_GRAPH_BATCH_SIZE, rows.length]);
    });
});

describe('toPlainNumber', () => {
    it('handles numbers, bigints and neo4j integers', () => {
        expect(toPlainNumber(3)).toBe(3);
        expect(toPlainNumber(3n)).toBe(3);
        expect(toPlainNumber({ toNumber: () => 4 })).toBe(4);
        expect(toPlainNumber(undefined)).toBe(0);
    });
});
