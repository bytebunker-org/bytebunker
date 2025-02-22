import { RelationshipLabelEnum } from '../relationship-label.enum.js';
import { Model, Neode, valueToJson, type Property } from '@bytebunker/neode';
import type { QueryResult } from 'neo4j-driver-core';
import { enumValues } from '../../util/util.js';

export interface JsonTreeRecordShape {
    activityTree: ActivityTreeShape;
}

export interface ActivityTreeShape {
    /**
     * labels joined with `:`
     */
    _type: string;

    _elementId: string;

    id: string;

    [key: string]: string | number | boolean | Record<string, unknown> | [ActivityTreeShape];
}

const propertyKeyMap: Partial<Record<string, string>> = {
    id: '@id',
};

const isJsonString = (value: string): boolean =>
    ['{', '['].includes(value.at(0) ?? '') && ['}', ']'].includes(value.at(-1) ?? '');

function hydrateRelationship(
    neode: Neode,
    relationshipLabel: RelationshipLabelEnum,
    model: Model<Record<string, unknown>> | undefined,
    obj: ActivityTreeShape[],
): [key: string, Record<string, unknown> | Record<string, unknown>[]] {
    const rel = [...(model?.relationships.values() ?? [])].find((r) => r.relationship === relationshipLabel);
    // console.log('found relationship', rel);

    const relationshipProperties = Object.fromEntries(
        Object.entries(obj[0])
            .map(([propKey, value]) => {
                // Ignore relationship properties for now
                if (propKey.startsWith(relationshipLabel)) {
                    return;
                }

                return [propKey, value];
            })
            .filter(Boolean),
    );

    return [rel?.name ?? relationshipLabel.toLowerCase(), hydrateNode(neode, relationshipProperties)];
}

function customValueToJson(key: string, value: unknown, property?: Property): unknown {
    if (typeof value === 'string' && isJsonString(value)) {
        return JSON.parse(value);
    }

    if (property) {
        return valueToJson(property, value);
    }

    return value;
}

function hydrateNode(neode: Neode, obj: ActivityTreeShape): Record<string, unknown> {
    const labels = obj._type?.split(':') ?? [];
    const model = neode.models.getByLabels(labels);

    const type = labels.at(-1);
    const secondaryTypes = labels.slice(0, -1);
    // console.log('hydrating node', labels, !!model);

    // TODO: properly store and retrieve secondaryTypes (to not include labels which are already inherited, like ASObject, Activity)
    return {
        ...(type ? { '@type': type } : {}),
        ...(secondaryTypes.length ? { '@secondaryTypes': secondaryTypes } : {}),
        ...Object.fromEntries(
            Object.entries(obj)
                .map(([key, value]): [string, unknown] | undefined => {
                    if (key.startsWith('_')) {
                        return;
                    }

                    const property = model?.properties.get(key);

                    // console.log('property, key:', key, 'name:', property?.name, 'type:', property?.type);

                    if (enumValues(RelationshipLabelEnum).includes(key) && Array.isArray(value)) {
                        return hydrateRelationship(
                            neode,
                            key as RelationshipLabelEnum,
                            model,
                            value as ActivityTreeShape[],
                        );
                    }

                    key = propertyKeyMap[key] ?? key;

                    return [key, customValueToJson(key, value, property)];
                })
                .filter(Boolean),
        ),
    };
}

export function hydrateGraph(neode: Neode, result: QueryResult<JsonTreeRecordShape>): unknown[] {
    return result.records.map((record) => {
        const rawActivity = record.get('activityTree');

        return hydrateNode(neode, rawActivity);
    });
}
