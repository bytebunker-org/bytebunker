import type { ASObjectNodeType } from '../as-object.schema.js';
import type { InferGraphEntityType, SchemaObject } from '@bytebunker/neode/types';

export const MusicRecordingSchema = {
    byArtist: 'string',
    inAlbum: 'string',
} satisfies SchemaObject;

export type MusicRecordingNodeType = InferGraphEntityType<typeof MusicRecordingSchema> & ASObjectNodeType;
