import { deconstructPipelineModuleIdentifier } from '../../../../etl/pipeline/pipeline-module/util/pipeline-module-identifier.util.js';
import type { PipelineModuleIdentifier } from '../../../../etl/pipeline/pipeline-module/type/pipeline-module-identifier.type.js';
import { NodeLabelEnum } from '../../../../activity-graph/node-label.enum.js';
import { RelationshipLabelEnum } from '../../../../activity-graph/relationship-label.enum.js';

/** Rows per UNWIND statement and nodes/relationships per delete batch. */
export const DERIVED_GRAPH_BATCH_SIZE = 1000;

/**
 * Stamped on every node and relationship an enrichment module writes. `derivedBy` is the module id without its
 * version, so a new module version replaces the output of the previous one.
 */
export interface DerivedProvenance {
    derived: true;
    derivedBy: string;
    derivedVersion: number;
    importExecutionId: number;
    derivedAt: string;
}

export interface DerivedNodeRow {
    id: string;
    props: Record<string, unknown>;
}

export interface DerivedRelationshipRow {
    fromId: string;
    toId: string;
    props: Record<string, unknown>;
}

export function buildDerivedProvenance(
    moduleId: PipelineModuleIdentifier,
    executionId: number,
    now: Date = new Date(),
): DerivedProvenance {
    const { extensionName, moduleName, moduleVersion } = deconstructPipelineModuleIdentifier(moduleId);

    return {
        derived: true,
        derivedBy: `${extensionName}:${moduleName}`,
        derivedVersion: moduleVersion,
        importExecutionId: executionId,
        derivedAt: now.toISOString(),
    };
}

export function escapeCypherIdentifier(identifier: string): string {
    return `\`${identifier.replaceAll('`', '``')}\``;
}

// Labels and relationship types are the only interpolated values; they come from the label enums (and are escaped on
// top of that). Batch sizes are inlined because LIMIT needs an integer and JS numbers travel as floats.

/**
 * `additionalLabels` are set on top of `label`, e.g. `Activity` for a derived activity type. `preserveProperties` survive
 * the rewrite (values other modules added to the node, e.g. geocoding on canonical places).
 */
export function buildWriteDerivedNodesCypher(
    label: NodeLabelEnum,
    additionalLabels: NodeLabelEnum[] = [],
    preserveProperties: readonly string[] = [],
): string {
    const labels = [label, ...additionalLabels].map(escapeCypherIdentifier).join(':');
    const kept = preserveProperties.map((key) => `.${escapeCypherIdentifier(key)}`).join(', ');

    return [
        'UNWIND $rows AS row',
        `MERGE (n:${escapeCypherIdentifier(NodeLabelEnum.AS_OBJECT)} { id: row.id })`,
        ...(kept ? [`WITH n, row, n { ${kept} } AS kept`] : []),
        // `=` replaces every property, so a flag that is no longer true does not linger from an earlier run.
        `SET n = row.props, ${kept ? 'n += kept, ' : ''}n += $provenance, n.id = row.id, n:${labels}`,
        'WITH n',
        `MATCH (generator:${escapeCypherIdentifier(NodeLabelEnum.EXTENSION)} { id: $generatorId })`,
        `MERGE (n)-[:${escapeCypherIdentifier(RelationshipLabelEnum.GENERATED_BY)}]->(generator)`,
    ].join('\n');
}

export function buildWriteDerivedRelationshipsCypher(type: RelationshipLabelEnum): string {
    const asObject = escapeCypherIdentifier(NodeLabelEnum.AS_OBJECT);

    return [
        'UNWIND $rows AS row',
        `MATCH (from:${asObject} { id: row.fromId })`,
        `MATCH (to:${asObject} { id: row.toId })`,
        `CREATE (from)-[r:${escapeCypherIdentifier(type)}]->(to)`,
        'SET r = row.props, r += $provenance',
    ].join('\n');
}

export function buildDeleteDerivedRelationshipsCypher(type: RelationshipLabelEnum): string {
    return [
        `MATCH ()-[r:${escapeCypherIdentifier(type)}]->()`,
        'WHERE r.derivedBy = $derivedBy',
        `WITH r LIMIT ${DERIVED_GRAPH_BATCH_SIZE}`,
        'DELETE r',
        'RETURN count(*) AS deleted',
    ].join('\n');
}

/** Nodes of the module that the current execution did not (re-)write. */
export function buildDeleteStaleDerivedNodesCypher(label: NodeLabelEnum): string {
    return [
        `MATCH (n:${escapeCypherIdentifier(label)})`,
        'WHERE n.derivedBy = $derivedBy AND (n.importExecutionId IS NULL OR n.importExecutionId <> $executionId)',
        `WITH n LIMIT ${DERIVED_GRAPH_BATCH_SIZE}`,
        'DETACH DELETE n',
        'RETURN count(*) AS deleted',
    ].join('\n');
}

export function buildCountDerivedNodesCypher(label: NodeLabelEnum): string {
    return `MATCH (n:${escapeCypherIdentifier(label)}) WHERE n.derivedBy = $derivedBy RETURN count(n) AS count`;
}

export function buildCountDerivedRelationshipsCypher(type: RelationshipLabelEnum): string {
    return `MATCH ()-[r:${escapeCypherIdentifier(type)}]->() WHERE r.derivedBy = $derivedBy RETURN count(r) AS count`;
}

/** Neo4j returns integers as `Integer` objects (or bigint, depending on the driver config). */
export function toPlainNumber(value: unknown): number {
    if (typeof value === 'number') {
        return value;
    }

    if (typeof value === 'bigint') {
        return Number(value);
    }

    if (value && typeof value === 'object' && 'toNumber' in value && typeof value.toNumber === 'function') {
        return (value as { toNumber: () => number }).toNumber();
    }

    return value === null || value === undefined ? 0 : Number(value);
}
