import type { ASActivityNodeType } from '../as-activity.schema.js';
import type { InferGraphEntityType, SchemaObject } from '@bytebunker/neode/types';

export const SpotifyListenActivitySchema = {
    platform: 'string',
    ipAddress: 'string',
    reasonStart: 'string',
    reasonEnd: 'string',
    shuffle: 'boolean',
    skipped: 'boolean',
    offline: 'boolean',
    offlineTimestamp: 'string',
    incognitoMode: 'boolean',
} satisfies SchemaObject;

export type SpotifyListenActivityNodeType = InferGraphEntityType<typeof SpotifyListenActivitySchema> &
    ASActivityNodeType;
