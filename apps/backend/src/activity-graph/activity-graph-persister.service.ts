import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
    RequiredActivityGraphInterface,
    RequiredActivityGraphObjectInterface,
} from './type/required-activity-graph.interface.js';
import { extractASObjectId } from './activity-graph.util.js';
import type { ASObject } from '@bytebunker/event-schema';
import { toSnakeCase } from 'js-convert-case';
import * as R from 'remeda';
import { relationshipInfoMap } from './schema/graph-schema.constant.js';
import { v7 as uuidV7 } from 'uuid';
import { Neode } from '@bytebunker/neode';
import type { ActivityDto } from './dto/activity.dto.js';
import type { EntityManager } from '@mikro-orm/postgresql';
import { NodeStableKeyEntity } from './entity/node-stable-key.entity.js';
import { NEODE_PROVIDER } from './graph-database/neode.constant.js';
import { groupByKeySingle } from '../util/util.js';

@Injectable()
export class ActivityGraphPersisterService {
    private readonly logger = new Logger(ActivityGraphPersisterService.name);

    constructor(@Inject(NEODE_PROVIDER) private readonly neode: Neode) {}

    public async createActivityGraph(
        em: EntityManager,
        activities: ActivityDto[],
    ): Promise<{ createdCount: number; existingCount: number }> {
        const stableKeys = new Set(activities.flatMap((a) => a.stableKeys).filter(Boolean));

        const activityType = activities[0]?.['@type'] ?? 'unknown';

        const existingStableKeys = await em.findAll(NodeStableKeyEntity, {
            fields: ['stableKey'],
            where: {
                stableKey: {
                    $in: [...stableKeys],
                },
            },
        });
        const existingActivityStableKeys = new Set(existingStableKeys.flatMap((n) => n.stableKey));

        const newActivities = activities.filter(
            (activity) => !activity.stableKeys?.some((stableKey) => existingActivityStableKeys.has(stableKey)),
        );

        this.logger.log(
            `Storing ${newActivities.length} ${activityType} activity node graphs, found ${activities.length - newActivities.length} duplicates.`,
        );

        const newActivityNodes = this.processActivitiesToNodes(newActivities);
        const newActivityStableKeys = new Set(newActivityNodes.flatMap((a) => a.requiredStableKeys).filter(Boolean));

        const existingASObjectStableKeys = await em.findAll(NodeStableKeyEntity, {
            where: {
                stableKey: {
                    $in: [...newActivityStableKeys],
                },
            },
        });
        const existingASObjectStableKeyMap = groupByKeySingle(existingASObjectStableKeys, 'stableKey');

        let i = 0;
        for (const newActivityNode of newActivityNodes) {
            await em.fork().transactional(async (em) => {
                await this.insertActivityNodes(em, existingASObjectStableKeyMap, newActivityNode);
                i++;

                if (i % 100 === 0) {
                    this.logger.log(`Stored ${i}/${newActivities.length} ${activityType} activity graphs...`);
                }
            });
        }

        this.logger.log(`Done storing ${newActivities.length} ${activityType} activity graphs!`);

        return {
            createdCount: newActivities.length,
            existingCount: activities.length - newActivities.length,
        };
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
                } else if (value && typeof value === 'object' && key !== 'stableKeys') {
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

    private async insertActivityNodes(
        em: EntityManager,
        existingASObjectStableKeyMap: Partial<Record<string, NodeStableKeyEntity>>,
        activityGraph: RequiredActivityGraphInterface,
    ): Promise<void> {
        const builder = this.neode.query();

        const relationships: { propertyKey: string; targetNodeAlias: string }[] = [];

        const createdNodeStableKeys: NodeStableKeyEntity[] = [];

        for (const [propertyKey, object] of Object.entries(activityGraph.requiredObjects)) {
            const existingNodeId = object.originalObject.stableKeys
                ?.map((sk) => existingASObjectStableKeyMap[sk]?.nodeId)
                .find(Boolean);

            // If there is an existing node (based on stable key) then reference it
            const newNodeId = existingNodeId ?? object.id ?? uuidV7();

            const targetNodeAlias = `${toSnakeCase(propertyKey)}_node`;
            const targetNodeType = object.type;

            relationships.push({ propertyKey, targetNodeAlias });

            if (newNodeId && targetNodeType && object.originalObject.stableKeys?.length) {
                for (const stableKey of object.originalObject.stableKeys) {
                    createdNodeStableKeys.push(
                        em.create(
                            NodeStableKeyEntity,
                            {
                                stableKey: stableKey.slice(0, 512),
                                nodeId: newNodeId,
                            },
                            { persist: false },
                        ),
                    );
                }
            }

            // TODO: How should the properties of existing nodes be updated (or not)?
            if (targetNodeType) {
                const nodeProperties = R.omit(object.originalObject, ['@id', '@type', 'stableKeys', '@secondaryTypes']);

                for (const [key, value] of Object.entries(nodeProperties)) {
                    if (value && typeof value === 'object') {
                        // @ts-ignore
                        nodeProperties[key] = JSON.stringify(value);
                    }
                }

                builder.merge(targetNodeAlias, targetNodeType, { id: newNodeId });

                for (const [key, value] of Object.entries(nodeProperties)) {
                    builder
                        .onCreateSet(`${targetNodeAlias}.${key}`, value)
                        .onMatchSet(`${targetNodeAlias}.${key}`, value);
                }
            } else {
                builder.match(targetNodeAlias, undefined, { id: object.id });
            }
        }

        const newActivityNodeId = uuidV7();
        const activityNodeAlias = 'activityNode';
        const nodeProperties = R.omit(activityGraph.activity, [
            '@type',
            'stableKeys',
            '@secondaryTypes',
            ...relationships.map((r) => r.propertyKey as keyof ActivityDto),
        ]);

        builder.create(activityNodeAlias, activityGraph.activity['@type'], {
            id: newActivityNodeId,
            ...nodeProperties,
        });
        for (const stableKey of activityGraph.activity.stableKeys ?? []) {
            // Don't immediately persist, the changes will get upserted all at once
            createdNodeStableKeys.push(
                em.create(
                    NodeStableKeyEntity,
                    {
                        stableKey: stableKey.slice(0, 512),
                        nodeId: newActivityNodeId,
                    },
                    { persist: false },
                ),
            );
        }

        for (const relationship of relationships) {
            const relationshipInfo = relationshipInfoMap[relationship.propertyKey];

            if (!relationshipInfo) {
                throw new Error(
                    `Unknown relationship on property ${relationship.propertyKey} of activity ${activityGraph.activity['@type']}`,
                );
            }

            builder
                .merge(activityNodeAlias)
                .relationship(relationshipInfo.type, relationshipInfo.direction)
                .to(relationship.targetNodeAlias);
        }

        await builder.execute();

        if (createdNodeStableKeys.length) {
            const uniqueCreatedNodeStableKeys = createdNodeStableKeys.filter(
                (item, pos) => createdNodeStableKeys.findIndex((s) => s.stableKey === item.stableKey) === pos,
            );

            await em.upsertMany(uniqueCreatedNodeStableKeys);
        }
    }
}
