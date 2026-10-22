import { Inject, Injectable, Logger } from '@nestjs/common';
import { Neode } from '@bytebunker/neode';
import * as R from 'remeda';
import { NEODE_PROVIDER } from '../../../../activity-graph/graph-database/neode.constant.js';
import type { NodeLabelEnum } from '../../../../activity-graph/node-label.enum.js';
import type { RelationshipLabelEnum } from '../../../../activity-graph/relationship-label.enum.js';
import { ENRICHMENT_EXTENSION, ENRICHMENT_EXTENSION_ID } from '../../local-extension.constant.js';
import {
    buildCountDerivedNodesCypher,
    buildCountDerivedRelationshipsCypher,
    buildDeleteDerivedRelationshipsCypher,
    buildDeleteStaleDerivedNodesCypher,
    buildWriteDerivedNodesCypher,
    buildWriteDerivedRelationshipsCypher,
    DERIVED_GRAPH_BATCH_SIZE,
    type DerivedNodeRow,
    type DerivedProvenance,
    type DerivedRelationshipRow,
    toPlainNumber,
} from './derived-graph.util.js';

export interface DerivedOutputScope {
    /** Labels of the nodes the module derives. Nodes not re-written by the current execution are removed. */
    nodeLabels: NodeLabelEnum[];
    /** Relationship types the module derives. All of the module's previous relationships are removed first. */
    relationshipTypes: RelationshipLabelEnum[];
}

export interface DerivedReplacementResult {
    /** Previous relationships removed (before writing) or, on a dry run, that would be replaced. */
    replacedRelationships: number;
    /** Previous nodes removed because this run did not produce them again; on a dry run: all existing nodes. */
    replacedNodes: number;
    dryRun: boolean;
}

/**
 * Writes the output of enrichment modules: data derived from the graph, never imported. Every node and relationship
 * carries {@link DerivedProvenance}, and a run replaces the previous output of the same module, so thresholds can be
 * tuned and results recomputed.
 *
 * Replacement order (see {@link replaceDerived}): the module's relationships are deleted before writing (they are
 * created, not merged, so a retry must not duplicate them); nodes are merged on their deterministic id and only the
 * ones this execution did not write are deleted afterwards. That keeps ids of unchanged nodes stable, and other
 * modules' relationships to them survive the re-run.
 */
@Injectable()
export class DerivedGraphService {
    private readonly logger = new Logger(DerivedGraphService.name);

    constructor(@Inject(NEODE_PROVIDER) private readonly neode: Neode) {}

    /**
     * Replaces the module's previous output with what `write` produces. On a dry run nothing is written or deleted;
     * the result reports how much of the existing output would be replaced.
     */
    public async replaceDerived(
        provenance: DerivedProvenance,
        scope: DerivedOutputScope,
        options: { dryRun: boolean; write: () => Promise<void> },
    ): Promise<DerivedReplacementResult> {
        if (options.dryRun) {
            return { ...(await this.countDerived(provenance.derivedBy, scope)), dryRun: true };
        }

        let replacedRelationships = 0;

        for (const type of scope.relationshipTypes) {
            replacedRelationships += await this.deleteInBatches(buildDeleteDerivedRelationshipsCypher(type), {
                derivedBy: provenance.derivedBy,
            });
        }

        await options.write();

        let replacedNodes = 0;

        for (const label of scope.nodeLabels) {
            replacedNodes += await this.deleteInBatches(buildDeleteStaleDerivedNodesCypher(label), {
                derivedBy: provenance.derivedBy,
                executionId: provenance.importExecutionId,
            });
        }

        this.logger.log(
            `${provenance.derivedBy}: replaced ${replacedNodes} node(s) and ${replacedRelationships} relationship(s) of earlier runs`,
        );

        return { replacedRelationships, replacedNodes, dryRun: false };
    }

    public async countDerived(
        derivedBy: string,
        scope: DerivedOutputScope,
    ): Promise<{ replacedNodes: number; replacedRelationships: number }> {
        let replacedNodes = 0;
        let replacedRelationships = 0;

        for (const label of scope.nodeLabels) {
            replacedNodes += await this.readCount(buildCountDerivedNodesCypher(label), { derivedBy });
        }

        for (const type of scope.relationshipTypes) {
            replacedRelationships += await this.readCount(buildCountDerivedRelationshipsCypher(type), { derivedBy });
        }

        return { replacedNodes, replacedRelationships };
    }

    /** Merges derived nodes on their id, with the given label, provenance and a GENERATED_BY edge to the extension. */
    public async writeNodes(
        label: NodeLabelEnum,
        rows: DerivedNodeRow[],
        provenance: DerivedProvenance,
        onProgress?: (written: number) => void,
    ): Promise<void> {
        await this.neode.writeCypher(
            'MERGE (generator:Extension { id: $generatorId }) ON CREATE SET generator.name = $generatorName',
            { generatorId: ENRICHMENT_EXTENSION_ID, generatorName: ENRICHMENT_EXTENSION },
        );

        const cypher = buildWriteDerivedNodesCypher(label);
        let written = 0;

        for (const chunk of R.chunk(rows, DERIVED_GRAPH_BATCH_SIZE)) {
            await this.neode.writeCypher(cypher, { rows: chunk, provenance, generatorId: ENRICHMENT_EXTENSION_ID });
            written += chunk.length;
            onProgress?.(written);
        }
    }

    /** Creates derived relationships between existing nodes (matched by id; rows with a missing end are dropped). */
    public async writeRelationships(
        type: RelationshipLabelEnum,
        rows: DerivedRelationshipRow[],
        provenance: DerivedProvenance,
        onProgress?: (written: number) => void,
    ): Promise<void> {
        const cypher = buildWriteDerivedRelationshipsCypher(type);
        let written = 0;

        for (const chunk of R.chunk(rows, DERIVED_GRAPH_BATCH_SIZE)) {
            await this.neode.writeCypher(cypher, { rows: chunk, provenance });
            written += chunk.length;
            onProgress?.(written);
        }
    }

    private async deleteInBatches(cypher: string, params: Record<string, unknown>): Promise<number> {
        let total = 0;

        for (;;) {
            const result = await this.neode.writeCypher<{ deleted: unknown }>(cypher, params);
            const deleted = toPlainNumber(result.records[0]?.get('deleted'));
            total += deleted;

            if (deleted < DERIVED_GRAPH_BATCH_SIZE) {
                return total;
            }
        }
    }

    private async readCount(cypher: string, params: Record<string, unknown>): Promise<number> {
        const result = await this.neode.readCypher<{ count: unknown }>(cypher, params);

        return toPlainNumber(result.records[0]?.get('count'));
    }
}
