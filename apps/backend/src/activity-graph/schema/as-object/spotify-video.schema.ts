import type { VideoNodeType } from './video.schema.js';
import type { InferGraphEntityType, SchemaObject } from '@bytebunker/neode/types';

/** The video version of a Spotify track (music video, canvas) or podcast episode (video podcast). */
export const SpotifyVideoSchema = {
    /** `track` or `episode`: what the URI in `identifier` points at. */
    contentType: 'string',
    byArtist: 'string',
    inAlbum: 'string',
    showName: 'string',
} satisfies SchemaObject;

export type SpotifyVideoNodeType = InferGraphEntityType<typeof SpotifyVideoSchema> & VideoNodeType;
