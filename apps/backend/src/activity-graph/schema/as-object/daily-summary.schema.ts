import type { InferGraphEntityType, SchemaObject } from '@bytebunker/neode/types';
import type { ASObjectNodeType } from '../as-object.schema.js';

/**
 * Aggregates of one local day, derived by enrichment:daily-summary and keyed by date (`id` = `daily-summary:<date>`),
 * so re-runs update the same node. Per-mode distances are parallel lists (`moveModes`, `moveModeKm`) and visited
 * places a list (`placeIds`), which neode cannot describe.
 */
export const DailySummarySchema = {
    date: {
        type: 'string',
        indexed: true,
    },
    timezone: 'string',
    startTime: 'string',
    endTime: 'string',
    activityCount: 'integer',
    arriveCount: 'integer',
    moveCount: 'integer',
    listenCount: 'integer',
    viewCount: 'integer',
    eventCount: 'integer',
    placeCount: 'integer',
    moveDistanceKm: 'float',
    listeningMinutes: 'float',
    onTrip: 'boolean',
    derived: 'boolean',
    derivedBy: {
        type: 'string',
        indexed: true,
    },
    derivedVersion: 'number',
} satisfies SchemaObject;

export type DailySummaryNodeType = InferGraphEntityType<typeof DailySummarySchema> & ASObjectNodeType;
