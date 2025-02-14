import { ActivityTypeEnum } from '@bytebunker/event-schema/extension/google';
import type { SimplifiedRawPath, WaypointPath } from '@bytebunker/event-schema/extension/google';

/**
 * type: GoogleTimelineActivity
 */
export interface GoogleTimelineActivityInterface {
    activityType?: ActivityTypeEnum;

    waypointPath?: WaypointPath;

    simplifiedRawPath?: SimplifiedRawPath;
}
