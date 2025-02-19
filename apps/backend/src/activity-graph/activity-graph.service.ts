import { Inject, Injectable } from '@nestjs/common';
import type { ActivityDto } from './dto/activity.dto.js';
import type { EntityManager } from '@mikro-orm/postgresql';
import { UserService } from '../user/user.service.js';
import type { Node } from '@bytebunker/neode';
import { Neode } from '@bytebunker/neode';
import { NEODE_PROVIDER } from './graph-database/neode.constant.js';
import { NodeLabelEnum } from './node-label.enum.js';
import type { PersonNodeType } from './schema/as-object/person.schema.js';
import type { ExtensionNodeType } from './schema/extension.schema.js';
import { CORE_EXTENSION_ID, CORE_EXTENSION_NAME } from '../extension/extension.constant.js';
import type { UserEntity } from '../user/entity/user.entity.js';
import { NodeStableKeyEntity } from './entity/node-stable-key.entity.js';
import type {
    RequiredActivityGraphInterface,
    RequiredActivityGraphObjectInterface,
} from './type/required-activity-graph.interface.js';
import { extractASObjectId } from './activity-graph.util.js';
import type { ASObject } from '@bytebunker/event-schema';
import { groupByKeySingle } from '../util/util.js';
import { toSnakeCase } from 'js-convert-case';
import * as R from 'remeda';
import { relationshipInfoMap } from './schema/graph-schema.constant.js';

@Injectable()
export class ActivityGraphService {
    private ownerActorNode?: Node<PersonNodeType>;

    constructor(
        private readonly userService: UserService,
        @Inject(NEODE_PROVIDER) private readonly neode: Neode,
    ) {}

    public async createActivityGraph(
        em: EntityManager,
        activities: ActivityDto[],
    ): Promise<{ createdCount: number; existingCount: number }> {
        const stableKeys = new Set(activities.flatMap((a) => a.stableKeys).filter(Boolean));

        const existingStableKeys = await em.findAll(NodeStableKeyEntity, {
            fields: ['stableKey'],
            where: {
                stableKey: {
                    $in: [...stableKeys],
                },
            },
        });
        const existingActivityStableKeys = new Set(existingStableKeys.flatMap((n) => n.stableKey));

        const newActivities = activities.filter((activity) => {
            try {
                const stableKeys =
                    typeof activity.stableKeys === 'string'
                        ? (JSON.parse(activity.stableKeys) as string[])
                        : activity.stableKeys;
                return !stableKeys?.some((stableKey) => existingActivityStableKeys.has(stableKey));
            } catch (error) {
                console.error(error);
                console.log(
                    'activity.stableKeys',
                    activity.stableKeys,
                    typeof activity.stableKeys,
                    'isArray:',
                    Array.isArray(activity.stableKeys),
                );
                throw error;
            }
        });
        const newActivityNodes = this.processActivitiesToNodes(newActivities);
        const newActivityStableKeys = new Set(newActivityNodes.flatMap((a) => a.requiredStableKeys).filter(Boolean));

        console.log('[...newActivityStableKeys]', [...newActivityStableKeys]);
        const existingASObjectStableKeys = await em.findAll(NodeStableKeyEntity, {
            where: {
                stableKey: {
                    $in: [...newActivityStableKeys],
                },
            },
        });
        const existingASObjectStableKeyMap = groupByKeySingle(existingASObjectStableKeys, 'stableKey');

        for (const newActivityNode of newActivityNodes) {
            await em.fork().transactional(async (em) => {
                await this.insertActivityNodes(em, existingASObjectStableKeyMap, newActivityNode);
            });
        }

        return {
            createdCount: newActivities.length,
            existingCount: activities.length - newActivities.length,
        };
    }

    public async createUserPersonNode(em: EntityManager, user: UserEntity): Promise<Node<PersonNodeType>> {
        const [userNode, extension] = await Promise.all([
            this.neode.merge<PersonNodeType>(NodeLabelEnum.PERSON, {
                id: String(user.id),
                name: user.username,
            }),
            this.neode.merge<ExtensionNodeType>(NodeLabelEnum.EXTENSION, {
                id: CORE_EXTENSION_ID,
                name: CORE_EXTENSION_NAME,
            }),
        ]);
        await userNode.relateTo(extension, 'generator');

        return userNode;
    }

    public async getOwnerActor(em: EntityManager): Promise<Node<PersonNodeType>> {
        if (!this.ownerActorNode) {
            const ownerUser = await this.userService.getOwnerUser(em);

            this.ownerActorNode = await this.createUserPersonNode(em, ownerUser);
        }

        return this.ownerActorNode;
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

        for (const [propertyKey, object] of Object.entries(activityGraph.requiredObjects)) {
            const existingNodeId = object.originalObject.stableKeys
                ?.map((sk) => existingASObjectStableKeyMap[sk]?.nodeId)
                .find(Boolean);

            // If there is an existing node (based on stable key) then reference it
            if (existingNodeId && !object.id) {
                object.id = existingNodeId;
            }

            const targetNodeAlias = `${toSnakeCase(propertyKey)}_node`;
            const targetNodeType = object.type;

            relationships.push({ propertyKey, targetNodeAlias });

            // TODO: How should the properties of existing nodes be updated (or not)?
            if (targetNodeType) {
                const nodeProperties = R.omit(object.originalObject, ['@id', '@type', 'stableKeys', '@secondaryTypes']);

                for (const [key, value] of Object.entries(nodeProperties)) {
                    if (value && typeof value === 'object') {
                        // @ts-ignore
                        nodeProperties[key] = JSON.stringify(value);
                    }
                }

                builder.merge(targetNodeAlias, targetNodeType, {
                    ...(object.id ? { id: object.id } : {}),
                    ...nodeProperties,
                });
            } else {
                builder.match(targetNodeAlias, undefined, { id: object.id });
            }
        }

        const activityNodeAlias = 'activityNode';
        const nodeProperties = R.omit(activityGraph.activity, [
            '@type',
            'stableKeys',
            '@secondaryTypes',
            ...relationships.map((r) => r.propertyKey as keyof ActivityDto),
        ]);

        builder.create(activityNodeAlias, activityGraph.activity['@type'], nodeProperties);

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
        // console.log('Creating activity', activityGraph.activity['@type'], 'with query', builder.build());
        // TODO: Add stable keys to db
    }
}
