import type { StringSchema } from 'joi';
import type { ASActivityNodeType } from '../as-activity.schema.js';
import type { InferGraphEntityType, SchemaObject } from '@bytebunker/neode/types';
import { YouTubeProductEnum } from '@bytebunker/event-schema/extension/youtube';

export const YouTubeViewActivitySchema = {
    product: {
        type: 'string',
        extendSchema: (schema: StringSchema<string>) =>
            schema.allow(YouTubeProductEnum.YOUTUBE, YouTubeProductEnum.YOUTUBE_MUSIC),
    },
} satisfies SchemaObject;

export type YouTubeViewActivityNodeType = InferGraphEntityType<typeof YouTubeViewActivitySchema> &
    ASActivityNodeType;
