import type { ASObjectNodeType } from '../as-object.schema.js';
import type { InferGraphEntityType, SchemaObject } from '@bytebunker/neode/types';

export const VideoSchema = {} satisfies SchemaObject;

export type VideoNodeType = InferGraphEntityType<typeof VideoSchema> & ASObjectNodeType;
