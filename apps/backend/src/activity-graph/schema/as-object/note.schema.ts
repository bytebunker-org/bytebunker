import type { ASObjectNodeType } from '../as-object.schema.js';
import type { InferGraphEntityType, SchemaObject } from '@bytebunker/neode/types';

export const NoteSchema = {
    content: 'string',
} satisfies SchemaObject;

export type NoteNodeType = InferGraphEntityType<typeof NoteSchema> & ASObjectNodeType;
