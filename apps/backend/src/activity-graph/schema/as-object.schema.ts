import type { InferGraphEntityType, SchemaObject } from '@bytebunker/neode/types';
import { RelationshipDirectionEnum } from '@bytebunker/neode';
import { NodeLabelEnum } from '../node-label.enum.js';
import { RelationshipLabelEnum } from '../relationship-label.enum.js';

export const ASObjectSchema = {
    id: {
        primary: true,
        type: 'string',
        required: true,
    },
    generator: {
        type: 'relationship',
        required: true,
        target: NodeLabelEnum.EXTENSION,
        relationship: RelationshipLabelEnum.GENERATED_BY,
        direction: RelationshipDirectionEnum.OUT,
    },
    name: 'string',
    summary: 'string',
    published: {
        type: 'datetime',
        required: true,
        default: () => Date.now(),
    },
} satisfies SchemaObject;

export type ASObjectNodeType = InferGraphEntityType<typeof ASObjectSchema>;
