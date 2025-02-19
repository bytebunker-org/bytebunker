import type { InferGraphEntityType, SchemaObject } from '@bytebunker/neode/types';
import type { ASObjectNodeType } from '../as-object.schema.js';

export const PersonSchema = {} satisfies SchemaObject;

export type PersonNodeType = InferGraphEntityType<typeof PersonSchema> & ASObjectNodeType;
