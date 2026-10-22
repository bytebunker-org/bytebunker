import type { InferGraphEntityType, SchemaObject } from '@bytebunker/neode/types';
import type { ASActivityNodeType } from '../as-activity.schema.js';

/**
 * A trip away from home derived by enrichment:derive-trips. Destinations hang off it as `TO` (ranked by dwell time),
 * the activities during the trip as `INCLUDES`. Also carries the derived-data provenance and list properties
 * (`transportModes`, `transportModeKm`) that neode cannot describe.
 */
export const TravelActivitySchema = {
    distanceKm: 'float',
    durationHours: 'float',
    nights: 'integer',
    destinationCount: 'integer',
    primaryTransportMode: 'string',
    includedActivityCount: 'integer',
    derived: 'boolean',
    // Indexed: replacing a module's output looks its previous nodes up by this.
    derivedBy: {
        type: 'string',
        indexed: true,
    },
    derivedVersion: 'number',
} satisfies SchemaObject;

export type TravelActivityNodeType = InferGraphEntityType<typeof TravelActivitySchema> & ASActivityNodeType;
