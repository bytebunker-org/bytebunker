import type { InferGraphEntityType, SchemaObject } from '@bytebunker/neode/types';
import { RelationshipDirectionEnum } from '@bytebunker/neode';
import { NodeLabelEnum } from '../node-label.enum.js';
import { RelationshipLabelEnum } from '../relationship-label.enum.js';
import { type ASObjectNodeType } from './as-object.schema.js';

export const ASActivitySchema = {
    type: {
        type: 'string',
        required: true,
        indexed: true,
    },
    summary: {
        type: 'string',
    },
    actor: {
        type: 'relationship',
        relationship: RelationshipLabelEnum.ACTED_IN,
        target: NodeLabelEnum.PERSON,
        direction: RelationshipDirectionEnum.IN,
    },
    startTime: {
        type: 'datetime',
        required: true,
        indexed: true,
    },
    endTime: {
        type: 'datetime',
        indexed: true,
    },
    origin: {
        type: 'relationship',
        relationship: RelationshipLabelEnum.FROM,
        target: NodeLabelEnum.AS_OBJECT,
        direction: RelationshipDirectionEnum.OUT,
    },
    target: {
        type: 'relationship',
        relationship: RelationshipLabelEnum.TO,
        target: NodeLabelEnum.AS_OBJECT,
        direction: RelationshipDirectionEnum.OUT,
    },
    object: {
        type: 'relationship',
        relationship: RelationshipLabelEnum.INVOLVES,
        target: NodeLabelEnum.AS_OBJECT,
        direction: RelationshipDirectionEnum.OUT,
    },
} satisfies SchemaObject;

export type ASActivityNodeType = InferGraphEntityType<typeof ASActivitySchema> & ASObjectNodeType;
