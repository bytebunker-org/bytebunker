import type { ASActivityNodeType } from '../as-activity.schema.js';
import type { InferGraphEntityType, SchemaObject } from '@bytebunker/neode/types';

export const GoogleTimelineActivitySchema = {
    activityType: {
        type: 'string',
        required: true,
    },
    waypointPath: {
        // TODO: Json/Object type?
        type: 'string',
    },
    simplifiedRawPath: 'string',
} satisfies SchemaObject;

export type GoogleTimelineActivityNodeType = InferGraphEntityType<typeof GoogleTimelineActivitySchema> &
    ASActivityNodeType;
