import type { ASObjectNodeType } from '../as-object.schema.js';
import type { InferGraphEntityType, SchemaObject } from '@bytebunker/neode/types';

export const PodcastEpisodeSchema = {
    showName: 'string',
} satisfies SchemaObject;

export type PodcastEpisodeNodeType = InferGraphEntityType<typeof PodcastEpisodeSchema> & ASObjectNodeType;
