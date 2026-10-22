import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { v4 as uuidV4 } from 'uuid';
import { Neode } from '@bytebunker/neode';
import { registerGraphSchemas } from '../../../../activity-graph/schema/graph-schema.constant.js';
import { NodeLabelEnum } from '../../../../activity-graph/node-label.enum.js';
import { RelationshipLabelEnum } from '../../../../activity-graph/relationship-label.enum.js';
import { DerivedGraphService } from './derived-graph.service.js';
import { type DerivedProvenance, toPlainNumber } from './derived-graph.util.js';

const neo4jUri = process.env['BYTEBUNKER_TEST_NEO4J_URI'];
const neo4jUser = process.env['BYTEBUNKER_TEST_NEO4J_USER'];
const neo4jPassword = process.env['BYTEBUNKER_TEST_NEO4J_PASSWORD'];

/**
 * Everything this spec creates carries `testRun` (nodes) or a `derivedBy` unique to the run (derived nodes and
 * relationships), so it only ever replaces and deletes its own data - this may run against a development database.
 */
const testRun = `derived-graph-spec-${uuidV4()}`;
const derivedBy = `test:${testRun}`;
const scope = { nodeLabels: [NodeLabelEnum.CANONICAL_PLACE], relationshipTypes: [RelationshipLabelEnum.SAME_AS] };

function provenanceFor(executionId: number): DerivedProvenance {
    return {
        derived: true,
        derivedBy,
        derivedVersion: 1,
        importExecutionId: executionId,
        derivedAt: new Date().toISOString(),
    };
}

describe.skipIf(!neo4jUri)('DerivedGraphService (integration)', () => {
    let neode: Neode;
    let service: DerivedGraphService;
    const rawIds = [0, 1, 2].map((index) => `${testRun}:raw:${index}`);
    const canonicalIds = [0, 1].map((index) => `${testRun}:canonical:${index}`);

    beforeAll(async () => {
        neode = new Neode({
            connectionString: neo4jUri!,
            username: neo4jUser,
            password: neo4jPassword,
            enterprise: false,
        });
        registerGraphSchemas(neode);
        service = new DerivedGraphService(neode);

        await neode.writeCypher(
            'UNWIND $ids AS id CREATE (p:ASObject:Place { id: id, testRun: $testRun, latitude: 49.75, longitude: 6.64 })',
            { ids: rawIds, testRun },
        );
    });

    afterAll(async () => {
        if (!neode) {
            return;
        }

        await neode.writeCypher('MATCH (n) WHERE n.testRun = $testRun OR n.derivedBy = $derivedBy DETACH DELETE n', {
            testRun,
            derivedBy,
        });
        await neode.close();
    });

    async function count(cypher: string): Promise<number> {
        const result = await neode.readCypher<{ count: unknown }>(cypher, { derivedBy, testRun });

        return toPlainNumber(result.records[0]?.get('count'));
    }

    const countCanonical = () =>
        count('MATCH (n:CanonicalPlace) WHERE n.derivedBy = $derivedBy RETURN count(n) AS count');
    const countSameAs = () => count('MATCH ()-[r:SAME_AS]->() WHERE r.derivedBy = $derivedBy RETURN count(r) AS count');

    function run(executionId: number, canonical: string[], links: [string, string][], dryRun = false) {
        const provenance = provenanceFor(executionId);

        return service.replaceDerived(provenance, scope, {
            dryRun,
            write: async () => {
                await service.writeNodes(
                    NodeLabelEnum.CANONICAL_PLACE,
                    canonical.map((id) => ({ id, props: { name: id, ambiguous: executionId === 1 } })),
                    provenance,
                );
                await service.writeRelationships(
                    RelationshipLabelEnum.SAME_AS,
                    links.map(([fromId, toId]) => ({ fromId, toId, props: {} })),
                    provenance,
                );
            },
        });
    }

    it('writes derived nodes and relationships with provenance', async () => {
        await run(1, canonicalIds, [
            [rawIds[0]!, canonicalIds[0]!],
            [rawIds[1]!, canonicalIds[0]!],
            [rawIds[2]!, canonicalIds[1]!],
        ]);

        await expect(countCanonical()).resolves.toBe(2);
        await expect(countSameAs()).resolves.toBe(3);

        const result = await neode.readCypher<{ props: Record<string, unknown>; generators: unknown }>(
            `MATCH (n:ASObject { id: $id })
             RETURN properties(n) AS props, size([(n)-[:GENERATED_BY]->(:Extension) | 1]) AS generators`,
            { id: canonicalIds[0] },
        );
        const props = result.records[0]!.get('props');

        expect(props).toMatchObject({ derived: true, derivedBy, derivedVersion: 1, importExecutionId: 1 });
        expect(toPlainNumber(result.records[0]!.get('generators'))).toBe(1);
    });

    it('a dry run reports the existing output and changes nothing', async () => {
        const result = await run(2, [], [], true);

        expect(result).toEqual({ replacedNodes: 2, replacedRelationships: 3, dryRun: true });
        await expect(countCanonical()).resolves.toBe(2);
        await expect(countSameAs()).resolves.toBe(3);
    });

    it('a re-run replaces the previous output: stale nodes go, kept nodes are updated, no duplicate edges', async () => {
        const links: [string, string][] = rawIds.map((rawId) => [rawId, canonicalIds[0]!]);

        const result = await run(3, [canonicalIds[0]!], links);

        expect(result).toEqual({ replacedNodes: 1, replacedRelationships: 3, dryRun: false });
        await expect(countCanonical()).resolves.toBe(1);
        await expect(countSameAs()).resolves.toBe(3);

        // Retrying the same execution must not duplicate anything either.
        await run(3, [canonicalIds[0]!], links);
        await expect(countCanonical()).resolves.toBe(1);
        await expect(countSameAs()).resolves.toBe(3);

        const result2 = await neode.readCypher<{ props: Record<string, unknown> }>(
            'MATCH (n:ASObject { id: $id }) RETURN properties(n) AS props',
            { id: canonicalIds[0] },
        );
        // `ambiguous` was true in run 1 and is false now: properties are replaced, not merged.
        expect(result2.records[0]!.get('props')).toMatchObject({ importExecutionId: 3, ambiguous: false });

        // Raw places are never touched.
        await expect(count('MATCH (p:Place) WHERE p.testRun = $testRun RETURN count(p) AS count')).resolves.toBe(3);
    });
});
