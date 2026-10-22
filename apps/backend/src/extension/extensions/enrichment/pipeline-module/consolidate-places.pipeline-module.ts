import { Inject } from '@nestjs/common';
import { Optional, Required, Type } from 'ts-decorator-json-schema-generator';
import { Neode } from '@bytebunker/neode';
import { PipelineModule } from '../../../../etl/pipeline/pipeline-module/decorator/pipeline-module.decorator.js';
import { PipelineModuleJsonSchema } from '../../../../etl/pipeline/pipeline-module/decorator/pipeline-module-json-schema.decorator.js';
import type {
    IPipelineModule,
    PipelineModuleExecutionContext,
} from '../../../../etl/pipeline/pipeline-module/type/pipeline-module.interface.js';
import { NEODE_PROVIDER } from '../../../../activity-graph/graph-database/neode.constant.js';
import { NodeLabelEnum } from '../../../../activity-graph/node-label.enum.js';
import { RelationshipLabelEnum } from '../../../../activity-graph/relationship-label.enum.js';
import { ENRICHMENT_EXTENSION } from '../../local-extension.constant.js';
import { DerivedGraphService } from '../graph/derived-graph.service.js';
import { buildDerivedProvenance, toPlainNumber } from '../graph/derived-graph.util.js';
import { GEOCODE_PROPERTY_KEYS } from '../geocoding/geocoding.constant.js';
import { clusterPlaces, type PlaceCluster, type RawPlacePoint } from '../util/place-clustering.util.js';

const DEFAULT_RADIUS_METERS = 75;
const DEFAULT_MAX_CLUSTER_SPAN_METERS = 300;
const REPORTED_CLUSTERS = 10;
const REPORTED_AMBIGUOUS_CLUSTERS = 25;

@PipelineModuleJsonSchema()
export class ConsolidatePlacesInput {
    /** Places closer than this (meters) are the same place. Default 75. */
    @Optional()
    @Type('number')
    public radiusMeters?: number;

    /** Clusters wider than this (meters) are flagged `ambiguous` for review. Default 300. */
    @Optional()
    @Type('number')
    public maxClusterSpanMeters?: number;
}

export interface ConsolidatedPlaceSummary {
    id: string;
    name?: string;
    memberCount: number;
    visitCount: number;
    spanMeters: number;
    latitude: number;
    longitude: number;
    placeIds: string[];
}

export interface ConsolidatePlacesSummary {
    dryRun: boolean;
    radiusMeters: number;
    maxClusterSpanMeters: number;
    /** Raw Place nodes in the graph. */
    placesBefore: number;
    /** Raw places with usable coordinates, i.e. the ones consolidated. */
    placesConsolidated: number;
    /** Canonical places written (or that would be written). */
    placesAfter: number;
    placeIdClusters: number;
    coordinateClusters: number;
    /** Places without placeId that joined a placeId cluster. */
    absorbedPlaces: number;
    singletonClusters: number;
    ambiguousClusterCount: number;
    biggestClusters: ConsolidatedPlaceSummary[];
    ambiguousClusters: ConsolidatedPlaceSummary[];
    /** Output of earlier runs that was (or would be) replaced. */
    replacedCanonicalPlaces: number;
    replacedSameAsEdges: number;
}

@PipelineModuleJsonSchema()
export class ConsolidatePlacesOutput {
    @Required()
    @Type('integer')
    public canonicalPlaceCount!: number;

    /** Places before/after, biggest and ambiguous clusters. */
    @Required()
    @Type('object')
    public summary!: ConsolidatePlacesSummary;
}

/**
 * Builds one `CanonicalPlace` per real place from the raw `Place` nodes (one per coordinate or placeId), linked
 * from the raw places with `SAME_AS`. Raw places stay untouched; a re-run replaces the previous canonical places but
 * keeps the geocoding properties on the ones it writes again (see `GEOCODE_PROPERTY_KEYS`).
 */
@PipelineModule({
    extensionName: ENRICHMENT_EXTENSION,
    inputType: ConsolidatePlacesInput,
    outputType: ConsolidatePlacesOutput,
    progressWeight: 2,
    description:
        'Consolidates raw places into CanonicalPlace nodes (same Google placeId, or within radiusMeters) linked with ' +
        'SAME_AS from the raw places. Replaces its previous output; reports biggest and ambiguous clusters.',
})
export class ConsolidatePlacesPipelineModule
    implements IPipelineModule<ConsolidatePlacesInput, ConsolidatePlacesOutput>
{
    constructor(
        @Inject(NEODE_PROVIDER) private readonly neode: Neode,
        private readonly derivedGraphService: DerivedGraphService,
    ) {}

    public async executeModule({
        inputData,
        pipelineExecution,
        currentNode,
        progress,
        dryRun,
    }: PipelineModuleExecutionContext<ConsolidatePlacesInput>): Promise<ConsolidatePlacesOutput> {
        const radiusMeters = positiveOr(inputData.radiusMeters, DEFAULT_RADIUS_METERS);
        const maxClusterSpanMeters = positiveOr(inputData.maxClusterSpanMeters, DEFAULT_MAX_CLUSTER_SPAN_METERS);
        const provenance = buildDerivedProvenance(currentNode.moduleId, pipelineExecution.id);

        progress.message('Reading places');
        const { placesBefore, points } = await this.readPlaces();

        progress.message(`Clustering ${points.length.toLocaleString('en-US')} places`);
        const { clusters, absorbedCount } = clusterPlaces(points, { radiusMeters, maxClusterSpanMeters });

        const sameAsRows = clusters.flatMap((cluster) =>
            cluster.memberIds.map((memberId) => ({ fromId: memberId, toId: cluster.id, props: {} })),
        );
        const total = clusters.length + sameAsRows.length;

        if (!dryRun) {
            progress.report({ current: 0, total, unit: 'nodes and edges', message: 'Writing canonical places' });
        }

        const replacement = await this.derivedGraphService.replaceDerived(
            provenance,
            { nodeLabels: [NodeLabelEnum.CANONICAL_PLACE], relationshipTypes: [RelationshipLabelEnum.SAME_AS] },
            {
                dryRun,
                write: async () => {
                    await this.derivedGraphService.writeNodes(
                        NodeLabelEnum.CANONICAL_PLACE,
                        clusters.map((cluster) => ({ id: cluster.id, props: toNodeProps(cluster) })),
                        provenance,
                        (written) => progress.report({ current: written, total }),
                        [],
                        GEOCODE_PROPERTY_KEYS,
                    );
                    progress.message('Linking raw places');
                    await this.derivedGraphService.writeRelationships(
                        RelationshipLabelEnum.SAME_AS,
                        sameAsRows,
                        provenance,
                        (written) => progress.report({ current: clusters.length + written, total }),
                    );
                },
            },
        );

        const ambiguous = clusters.filter((cluster) => cluster.ambiguous);
        const summary: ConsolidatePlacesSummary = {
            dryRun,
            radiusMeters,
            maxClusterSpanMeters,
            placesBefore,
            placesConsolidated: points.length,
            placesAfter: clusters.length,
            placeIdClusters: clusters.filter((cluster) => cluster.kind === 'place-id').length,
            coordinateClusters: clusters.filter((cluster) => cluster.kind === 'coordinates').length,
            absorbedPlaces: absorbedCount,
            singletonClusters: clusters.filter((cluster) => cluster.memberIds.length === 1).length,
            ambiguousClusterCount: ambiguous.length,
            biggestClusters: [...clusters]
                .sort((a, b) => b.memberIds.length - a.memberIds.length || b.visitCount - a.visitCount)
                .slice(0, REPORTED_CLUSTERS)
                .map(toSummary),
            ambiguousClusters: [...ambiguous]
                .sort((a, b) => b.spanMeters - a.spanMeters)
                .slice(0, REPORTED_AMBIGUOUS_CLUSTERS)
                .map(toSummary),
            replacedCanonicalPlaces: replacement.replacedNodes,
            replacedSameAsEdges: replacement.replacedRelationships,
        };

        progress.message(
            `${dryRun ? 'Would consolidate' : 'Consolidated'} ${points.length.toLocaleString('en-US')} places into ` +
                `${clusters.length.toLocaleString('en-US')} (${ambiguous.length} ambiguous)`,
        );

        return { canonicalPlaceCount: clusters.length, summary };
    }

    private async readPlaces(): Promise<{ placesBefore: number; points: RawPlacePoint[] }> {
        const countResult = await this.neode.readCypher<{ count: unknown }>(
            `MATCH (p:${NodeLabelEnum.PLACE}) RETURN count(p) AS count`,
        );
        // Pattern comprehensions count the visits per place without a cartesian product over places and activities.
        const result = await this.neode.readCypher<{
            id: string;
            latitude: unknown;
            longitude: unknown;
            placeId: string | null;
            name: string | null;
            arriveCount: unknown;
            moveCount: unknown;
        }>(
            `MATCH (p:${NodeLabelEnum.PLACE})
             WHERE p.latitude IS NOT NULL AND p.longitude IS NOT NULL
             RETURN p.id AS id, p.latitude AS latitude, p.longitude AS longitude, p.placeId AS placeId, p.name AS name,
                    size([(a:${NodeLabelEnum.ACTIVITY_ARRIVE})-[:${RelationshipLabelEnum.TO}]->(p) | a]) AS arriveCount,
                    size([(m:${NodeLabelEnum.ACTIVITY_MOVE})-[:${RelationshipLabelEnum.FROM}|${RelationshipLabelEnum.TO}]->(p) | m]) AS moveCount`,
        );

        return {
            placesBefore: toPlainNumber(countResult.records[0]?.get('count')),
            points: result.records.map((record) => ({
                id: record.get('id'),
                latitude: Number(record.get('latitude')),
                longitude: Number(record.get('longitude')),
                placeId: record.get('placeId') || undefined,
                name: record.get('name') || undefined,
                arriveCount: toPlainNumber(record.get('arriveCount')),
                moveCount: toPlainNumber(record.get('moveCount')),
            })),
        };
    }
}

function toNodeProps(cluster: PlaceCluster): Record<string, unknown> {
    return {
        // `name` may be replaced by a better one (enrichment:geocode-places-offline); `sourceName` keeps the original.
        ...(cluster.name ? { name: cluster.name, sourceName: cluster.name } : {}),
        latitude: cluster.latitude,
        longitude: cluster.longitude,
        placeIds: cluster.placeIds,
        clusterKind: cluster.kind,
        memberCount: cluster.memberIds.length,
        visitCount: cluster.visitCount,
        moveCount: cluster.moveCount,
        spanMeters: Math.round(cluster.spanMeters * 10) / 10,
        ambiguous: cluster.ambiguous,
    };
}

function toSummary(cluster: PlaceCluster): ConsolidatedPlaceSummary {
    return {
        id: cluster.id,
        ...(cluster.name ? { name: cluster.name } : {}),
        memberCount: cluster.memberIds.length,
        visitCount: cluster.visitCount,
        spanMeters: Math.round(cluster.spanMeters),
        latitude: cluster.latitude,
        longitude: cluster.longitude,
        placeIds: cluster.placeIds.slice(0, 5),
    };
}

function positiveOr(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}
