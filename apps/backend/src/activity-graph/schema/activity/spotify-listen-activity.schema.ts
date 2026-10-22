import type { ASActivityNodeType } from '../as-activity.schema.js';
import type { InferGraphEntityType, SchemaObject } from '@bytebunker/neode/types';

/** Playback details of a Spotify Extended Streaming History row, shared by audio (Listen) and video (View) plays. */
export const SpotifyPlaybackSchema = {
    msPlayed: 'integer',
    platform: 'string',
    country: 'string',
    ipAddress: 'string',
    reasonStart: 'string',
    reasonEnd: 'string',
    shuffle: 'boolean',
    skipped: 'boolean',
    offline: 'boolean',
    offlineTimestamp: 'string',
    incognitoMode: 'boolean',
    mediaType: 'string',
} satisfies SchemaObject;

export const SpotifyListenActivitySchema = SpotifyPlaybackSchema;

export type SpotifyListenActivityNodeType = InferGraphEntityType<typeof SpotifyListenActivitySchema> &
    ASActivityNodeType;
