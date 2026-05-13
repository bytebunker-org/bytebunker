import type { InferGraphEntityType, SchemaObject } from '@bytebunker/neode/types';
import type { ASActivityNodeType } from '../as-activity.schema.js';

export const EventActivitySchema = {
    attendees: 'string',
} satisfies SchemaObject;

export type EventActivityNodeType = InferGraphEntityType<typeof EventActivitySchema> & ASActivityNodeType;
