import type { InferGraphEntityType, SchemaObject } from '@bytebunker/neode/types';
import type { ASActivityNodeType } from '../as-activity.schema.js';

/**
 * A search query the actor entered somewhere (Airbnb, Google Search, YouTube, Maps, ...). Not part of the
 * ActivityStreams vocabulary; `object`/`location` may point at what the search was about.
 */
export const SearchActivitySchema = {
    query: 'string',
} satisfies SchemaObject;

export type SearchActivityNodeType = InferGraphEntityType<typeof SearchActivitySchema> & ASActivityNodeType;
