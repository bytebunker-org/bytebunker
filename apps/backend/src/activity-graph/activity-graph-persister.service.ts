import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
    RequiredActivityGraphInterface,
    RequiredActivityGraphObjectInterface,
} from './type/required-activity-graph.interface.js';
import { extractASObjectId } from './activity-graph.util.js';
import type { ASObject, ASObjectType } from '@bytebunker/event-schema';
import { toSnakeCase } from 'js-convert-case';
import * as R from 'remeda';
import { relationshipInfoMap } from './schema/graph-schema.constant.js';
import { v7 as uuidV7 } from 'uuid';
import { Neode, RelationshipDirectionEnum } from '@bytebunker/neode';
import type { ActivityDto } from './dto/activity.dto.js';
import type { EntityManager } from '@mikro-orm/postgresql';
import { NEODE_PROVIDER } from './graph-database/neode.constant.js';
import { NodeLabelEnum } from './node-label.enum.js';
import { ACTIVITY_GRAPH_CHUNK_SIZE } from './activity-graph.constant.js';
import type {
    ActivityGraphSampleDto,
    CreateActivityGraphOptions,
    CreateActivityGraphResult,
    ImportProvenance,
} from './type/create-activity-graph.interface.js';
import {
    NodeStableKeyIndexService,
    type NodeStableKeyRow,
    truncateStableKey,
} from './node-stable-key-index.service.js';

const ACTIVITY_ALIAS = 'activity';
const OBJECT_ALIAS_PREFIX = 'obj_';

/**
 * A required object of an activity, resolved to the node it will be written to.
 * `labels === undefined` means the object carries no `@type` and is looked up by id only.
 */
interface PreparedObject {
    propertyKey: string;
    alias: string;
    labels: string[] | undefined;
    nodeId: string;
    props: Record<string, unknown>;
}

interface PreparedRow {
    shapeKey: string;
    nodeId: string;
    labels: string[];
    props: Record<string, unknown>;
    objects: PreparedObject[];
}

/**
 * The shape of a single `$rows` entry handed to the batched Cypher statement.
 */
interface ChunkStats {
    createdObjectCount: number;
    samples: CreateActivityGraphResult['samples'];
    sampleSize: number;
}

interface CypherRow {
    id: string;
    props: Record<string, unknown>;
    objects: Record<string, { id: string; props: Record<string, unknown> }>;
}

@Injectable()
export class ActivityGraphPersisterService {
    private readonly logger = new Logger(ActivityGraphPersisterService.name);

    constructor(
        @Inject(NEODE_PROVIDER) private readonly neode: Neode,
        private readonly nodeStableKeyIndexService: NodeStableKeyIndexService,
    ) {}

    /**
     * Writes the given activities and their required objects into the graph.
     *
     * Activities are processed in chunks of {@link ACTIVITY_GRAPH_CHUNK_SIZE}. Per chunk the
     * activities that already exist (by stable key) are dropped, the remaining rows are grouped by
     * their "shape" (label set of the activity + relationship property keys with the label set of
     * their target) and each shape is written with a single `UNWIND`-ed Cypher statement.
     */
    public async createActivityGraph(
        em: EntityManager,
        activities: ActivityDto[],
        options: CreateActivityGraphOptions = {},
    ): Promise<CreateActivityGraphResult> {
        const activityType = activities[0]?.['@type'] ?? 'unknown';
        const dryRun = options.dryRun ?? false;
        const stats: ChunkStats = {
            createdObjectCount: 0,
            samples: { created: [], existing: [] },
            sampleSize: options.sampleSize ?? 5,
        };

        /**
         * stable key -> node id for the whole call. Seeded from Postgres per chunk and extended
         * with every node id assigned in this call, so an object that appears in several chunks
         * resolves to the same node.
         */
        const nodeIdByStableKey = new Map<string, string>();

        const chunks = R.chunk(activities, ACTIVITY_GRAPH_CHUNK_SIZE);

        let createdCount = 0;
        let existingCount = 0;
        let processedCount = 0;

        for (const [chunkIndex, chunk] of chunks.entries()) {
            const chunkResult = await this.persistChunk(em, chunk, nodeIdByStableKey, stats, {
                dryRun,
                provenance: options.provenance,
            });

            createdCount += chunkResult.createdCount;
            existingCount += chunkResult.existingCount;
            processedCount += chunk.length;
            options.onProgress?.({
                processed: processedCount,
                total: activities.length,
                created: createdCount,
                existing: existingCount,
            });

            this.logger.log(
                `Stored ${processedCount}/${activities.length} ${activityType} activity graphs ` +
                    `(chunk ${chunkIndex + 1}/${chunks.length}, ${chunkResult.createdCount} created, ${chunkResult.existingCount} duplicates).`,
            );
        }

        this.logger.log(
            `${dryRun ? '[dry run] Would store' : 'Done storing'} ${createdCount} ${activityType} activity graphs, found ${existingCount} duplicates!`,
        );

        return {
            createdCount,
            existingCount,
            createdObjectCount: stats.createdObjectCount,
            dryRun,
            samples: stats.samples,
        };
    }

    private async persistChunk(
        em: EntityManager,
        activities: ActivityDto[],
        nodeIdByStableKey: Map<string, string>,
        stats: ChunkStats,
        { dryRun, provenance }: { dryRun: boolean; provenance?: ImportProvenance },
    ): Promise<{ createdCount: number; existingCount: number }> {
        const newStableKeys: NodeStableKeyRow[] = [];

        // 1. Drop activities that already exist, either in the Postgres index or earlier in this call.
        const unknownActivityStableKeys = activities
            .flatMap((activity) => activity.stableKeys ?? [])
            .filter(Boolean)
            .map((stableKey) => truncateStableKey(stableKey))
            .filter((stableKey) => !nodeIdByStableKey.has(stableKey));

        this.rememberStableKeys(
            nodeIdByStableKey,
            await this.nodeStableKeyIndexService.findNodeIds(em, unknownActivityStableKeys),
        );

        const newActivities: { activity: ActivityDto; nodeId: string }[] = [];
        let existingCount = 0;

        for (const activity of activities) {
            const stableKeys = (activity.stableKeys ?? []).filter(Boolean).map((key) => truncateStableKey(key));

            if (stableKeys.some((stableKey) => nodeIdByStableKey.has(stableKey))) {
                existingCount++;
                addSample(stats.samples.existing, activity, stats.sampleSize);
                continue;
            }

            addSample(stats.samples.created, activity, stats.sampleSize);

            const nodeId = uuidV7();
            newActivities.push({ activity, nodeId });

            for (const stableKey of stableKeys) {
                nodeIdByStableKey.set(stableKey, nodeId);
                newStableKeys.push({ stableKey, nodeId });
            }
        }

        if (newActivities.length === 0) {
            return { createdCount: 0, existingCount };
        }

        // 2. Collect the required objects of the surviving activities and resolve their node ids.
        const activityGraphs = this.processActivitiesToNodes(newActivities.map(({ activity }) => activity));

        const unknownObjectStableKeys = activityGraphs
            .flatMap((activityGraph) => activityGraph.requiredStableKeys)
            .filter(Boolean)
            .map((stableKey) => truncateStableKey(stableKey))
            .filter((stableKey) => !nodeIdByStableKey.has(stableKey));

        this.rememberStableKeys(
            nodeIdByStableKey,
            await this.nodeStableKeyIndexService.findNodeIds(em, unknownObjectStableKeys),
        );

        const objectKeyCountBefore = newStableKeys.length;
        const rows = activityGraphs.map((activityGraph, index) =>
            this.prepareRow(activityGraph, newActivities[index]!.nodeId, nodeIdByStableKey, newStableKeys),
        );
        stats.createdObjectCount += new Set(newStableKeys.slice(objectKeyCountBefore).map((row) => row.nodeId)).size;

        if (dryRun) {
            return { createdCount: newActivities.length, existingCount };
        }

        const provenanceParameter = {
            executionId: provenance?.executionId ?? null,
            assetId: provenance?.assetId ?? null,
            importedAt: new Date().toISOString(),
        };

        // 3. One Cypher statement per shape, plus one batched stable key insert, in one transaction.
        const rowsByShape = new Map<string, PreparedRow[]>();

        for (const row of rows) {
            const shapeRows = rowsByShape.get(row.shapeKey);

            if (shapeRows) {
                shapeRows.push(row);
            } else {
                rowsByShape.set(row.shapeKey, [row]);
            }
        }

        await em.fork().transactional(async (transactionalEm) => {
            for (const shapeRows of rowsByShape.values()) {
                await this.neode.writeCypher(this.buildShapeCypher(shapeRows[0]!), {
                    rows: shapeRows.map((row) => this.toCypherRow(row)),
                    provenance: provenanceParameter,
                });
            }

            await this.nodeStableKeyIndexService.insertMissing(transactionalEm, newStableKeys);
        });

        return { createdCount: newActivities.length, existingCount };
    }

    private rememberStableKeys(nodeIdByStableKey: Map<string, string>, found: Map<string, string>): void {
        for (const [stableKey, nodeId] of found) {
            nodeIdByStableKey.set(stableKey, nodeId);
        }
    }

    private processActivitiesToNodes(activities: ActivityDto[]): RequiredActivityGraphInterface[] {
        return activities.map((activity) => {
            const requiredObjects: Record<string, RequiredActivityGraphObjectInterface> = {};
            const requiredStableKeys: string[] = [];

            for (const [key, value] of Object.entries(activity)) {
                const isASObject = value && typeof value === 'object' && (value['@type'] || value['@id']);

                if (isASObject) {
                    requiredObjects[key] = {
                        id: extractASObjectId(value['@id']),
                        type: value['@type'],
                        originalObject: value as ASObject,
                    } satisfies RequiredActivityGraphObjectInterface;

                    requiredStableKeys.push(...(value['stableKeys']?.filter(Boolean) ?? []));
                } else if (value && typeof value === 'object' && key !== 'stableKeys' && key !== '@secondaryTypes') {
                    // TODO: Implement json properties in neode
                    // @ts-ignore
                    activity[key] = JSON.stringify(value);
                }
            }

            return {
                activity,
                requiredObjects,
                requiredStableKeys,
            };
        });
    }

    private prepareRow(
        activityGraph: RequiredActivityGraphInterface,
        activityNodeId: string,
        nodeIdByStableKey: Map<string, string>,
        newStableKeys: NodeStableKeyRow[],
    ): PreparedRow {
        const activityType = activityGraph.activity['@type'];
        const activityLabels = this.resolveLabels(
            activityType,
            activityGraph.activity['@secondaryTypes'],
            `activity ${activityType}`,
        );

        const objects: PreparedObject[] = [];

        for (const [propertyKey, object] of Object.entries(activityGraph.requiredObjects).sort(([a], [b]) =>
            a.localeCompare(b),
        )) {
            if (!relationshipInfoMap[propertyKey]) {
                throw new Error(`Unknown relationship on property ${propertyKey} of activity ${activityType}`);
            }

            const labels = object.type
                ? this.resolveLabels(
                      object.type,
                      object.originalObject['@secondaryTypes'],
                      `property ${propertyKey} of activity ${activityType}`,
                  )
                : undefined;

            if (!labels && !object.id) {
                throw new Error(
                    `Object on property ${propertyKey} of activity ${activityType} has neither a @type nor a resolvable @id`,
                );
            }

            objects.push({
                propertyKey,
                alias: `${OBJECT_ALIAS_PREFIX}${toSnakeCase(propertyKey)}`,
                labels,
                nodeId: labels
                    ? this.resolveObjectNodeId(object, nodeIdByStableKey, newStableKeys)
                    : // No `@type` - the node is matched by its id only, exactly like before.
                      object.id!,
                props: buildNodeProps(object.originalObject as unknown as Record<string, unknown>, [
                    '@id',
                    '@type',
                    '@secondaryTypes',
                    'stableKeys',
                ]),
            });
        }

        const labelsKey = (labels: string[] | undefined): string => labels?.join(':') ?? '';

        return {
            shapeKey: [
                labelsKey(activityLabels),
                ...objects.map((object) => `${object.propertyKey}=${labelsKey(object.labels)}`),
            ].join('|'),
            nodeId: activityNodeId,
            labels: activityLabels,
            props: buildNodeProps(activityGraph.activity as unknown as Record<string, unknown>, [
                '@id',
                '@type',
                '@secondaryTypes',
                'stableKeys',
                ...objects.map((object) => object.propertyKey),
            ]),
            objects,
        };
    }

    private resolveObjectNodeId(
        object: RequiredActivityGraphObjectInterface,
        nodeIdByStableKey: Map<string, string>,
        newStableKeys: NodeStableKeyRow[],
    ): string {
        const stableKeys = (object.originalObject.stableKeys ?? [])
            .filter(Boolean)
            .map((stableKey) => truncateStableKey(stableKey));

        for (const stableKey of stableKeys) {
            const existingNodeId = nodeIdByStableKey.get(stableKey);

            if (existingNodeId) {
                return existingNodeId;
            }
        }

        const nodeId = object.id ?? uuidV7();

        for (const stableKey of stableKeys) {
            nodeIdByStableKey.set(stableKey, nodeId);
            newStableKeys.push({ stableKey, nodeId });
        }

        return nodeId;
    }

    private resolveLabels(type: ASObjectType, secondaryTypes: ASObjectType[] | undefined, context: string): string[] {
        const labels = new Set(this.modelLabels(type, context));

        for (const secondaryType of secondaryTypes ?? []) {
            for (const label of this.modelLabels(secondaryType, context)) {
                labels.add(label);
            }
        }

        return [...labels].sort();
    }

    private modelLabels(type: string, context: string): string[] {
        const model = this.neode.models.get(type);

        if (!model) {
            throw new Error(
                `Unknown graph node type "${type}" on ${context}. Register it as a neode model in registerGraphSchemas().`,
            );
        }

        return model.labels;
    }

    private toCypherRow(row: PreparedRow): CypherRow {
        return {
            id: row.nodeId,
            props: row.props,
            objects: Object.fromEntries(
                row.objects.map((object) => [object.propertyKey, { id: object.nodeId, props: object.props }]),
            ),
        };
    }

    /**
     * Builds the batched Cypher statement for one shape. Labels and relationship types are the only
     * interpolated values and they always come from a registered neode model / the relationship
     * enum (and are backtick escaped on top of that); every property value travels as a parameter.
     */
    private buildShapeCypher(row: PreparedRow): string {
        const lines: string[] = ['UNWIND $rows AS row'];

        // Objects without a `@type` are matched by id only, so they have to come first.
        for (const object of row.objects.filter((object) => !object.labels)) {
            lines.push(`MATCH (${object.alias} { id: ${objectRowPath(object.propertyKey)}.id })`);
        }

        for (const object of row.objects.filter((object) => object.labels)) {
            lines.push(...buildNodeMergeLines(object.alias, object.labels!, objectRowPath(object.propertyKey)));
        }

        lines.push(...buildNodeMergeLines(ACTIVITY_ALIAS, row.labels, 'row'));

        for (const object of row.objects) {
            const relationshipInfo = relationshipInfoMap[object.propertyKey]!;
            const relationshipType = escapeIdentifier(relationshipInfo.type);

            lines.push(
                relationshipInfo.direction === RelationshipDirectionEnum.IN
                    ? `MERGE (${object.alias})-[:${relationshipType}]->(${ACTIVITY_ALIAS})`
                    : `MERGE (${ACTIVITY_ALIAS})-[:${relationshipType}]->(${object.alias})`,
            );
        }

        return lines.join('\n');
    }
}

function objectRowPath(propertyKey: string): string {
    return `row.objects.${escapeIdentifier(propertyKey)}`;
}

/**
 * `MERGE`s a node on its anchor label + id and then applies the remaining labels and the property
 * map. The anchor label is used on its own (instead of the full label set) because the unique
 * constraint lives on the anchor label and nodes written before a secondary type existed would
 * otherwise not be found by a full-label `MERGE` and collide on the `id` constraint.
 *
 * Update policy: last import wins - `+=` overwrites the properties it carries on both create and
 * match, and labels are only ever added, never removed.
 */
function buildNodeMergeLines(alias: string, labels: string[], rowPath: string): string[] {
    const [anchorLabel, ...additionalLabels] = orderNodeLabels(labels);

    const setItems = [`${alias} += ${rowPath}.props`];

    if (additionalLabels.length > 0) {
        setItems.push(`${alias}${additionalLabels.map((label) => `:${escapeIdentifier(label)}`).join('')}`);
    }

    return [
        `MERGE (${alias}:${escapeIdentifier(anchorLabel!)} { id: ${rowPath}.id })`,
        // Provenance: which execution (and imported file) created the node. Only on create, so re-imports and
        // other sources that touch the node later don't overwrite where it came from.
        `ON CREATE SET ${alias}.importExecutionId = $provenance.executionId, ${alias}.importAssetId = $provenance.assetId, ${alias}.importedAt = $provenance.importedAt`,
        `SET ${setItems.join(', ')}`,
    ];
}

/**
 * Puts the label carrying the unique `id` constraint first so it can be used as the `MERGE` anchor.
 */
function orderNodeLabels(labels: string[]): string[] {
    if (!labels.includes(NodeLabelEnum.AS_OBJECT)) {
        return [...labels];
    }

    return [NodeLabelEnum.AS_OBJECT, ...labels.filter((label) => label !== NodeLabelEnum.AS_OBJECT)];
}

function escapeIdentifier(identifier: string): string {
    return `\`${identifier.replaceAll('`', '``')}\``;
}

/**
 * Drops the keys that are handled separately (or not at all), removes `undefined` values and
 * serialises nested objects/arrays.
 */
function buildNodeProps(source: Record<string, unknown>, excludedKeys: string[]): Record<string, unknown> {
    const excluded = new Set(excludedKeys);
    const props: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(source)) {
        if (excluded.has(key) || value === undefined) {
            continue;
        }

        // TODO: Implement json properties in neode
        props[key] = value !== null && typeof value === 'object' ? JSON.stringify(value) : value;
    }

    return props;
}

function addSample(target: ActivityGraphSampleDto[], activity: ActivityDto, sampleSize: number): void {
    if (target.length >= sampleSize) {
        return;
    }

    const record = activity as unknown as Record<string, unknown>;
    const objects: Record<string, string> = {};

    for (const [key, value] of Object.entries(record)) {
        if (key === 'actor' || key === 'generator' || !value || typeof value !== 'object') {
            continue;
        }

        const object = value as Record<string, unknown>;

        if (object['@type']) {
            objects[key] = String(object['name'] ?? object['identifier'] ?? object['@type']);
        }
    }

    target.push({
        type: String(record['@type']),
        startTime: record['startTime'] ? String(record['startTime']) : undefined,
        summary: record['summary'] ? String(record['summary']) : undefined,
        objects,
    });
}
