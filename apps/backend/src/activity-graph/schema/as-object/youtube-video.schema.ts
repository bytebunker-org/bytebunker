import type { VideoNodeType } from './video.schema.js';
import type { InferGraphEntityType, SchemaObject } from '@bytebunker/neode/types';

export const YouTubeVideoSchema = {
    videoId: 'string',
    videoUrl: 'string',
    channelName: 'string',
    channelId: 'string',
    channelUrl: 'string',
} satisfies SchemaObject;

export type YouTubeVideoNodeType = InferGraphEntityType<typeof YouTubeVideoSchema> & VideoNodeType;
