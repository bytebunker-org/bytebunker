import type { AudioNodeType } from './audio.schema.js';
import type { InferGraphEntityType, SchemaObject } from '@bytebunker/neode/types';

export const AudiobookChapterSchema = {
    /** Title of the audiobook the chapter belongs to. */
    audiobookTitle: 'string',
    /** Identifier (e.g. Spotify URI) of the audiobook the chapter belongs to. */
    audiobookIdentifier: 'string',
} satisfies SchemaObject;

export type AudiobookChapterNodeType = InferGraphEntityType<typeof AudiobookChapterSchema> & AudioNodeType;
