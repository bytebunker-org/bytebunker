import type { InferGraphEntityType, SchemaObject } from '../../../../../../../neode/lib/types/index.js';
import type { ASActivityNodeType } from '../as-activity.schema.js';

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
