import type { InferGraphEntityType, SchemaObject } from '@bytebunker/neode/types';
import type { ASObjectNodeType } from '../as-object.schema.js';

/**
 * A real-world place consolidated from many raw `Place` nodes (enrichment:consolidate-places). Also carries the
 * derived-data provenance (`derived`, `derivedBy`, `derivedVersion`, `importExecutionId`) and `placeIds`, a list of
 * Google place ids, which neode cannot describe and is therefore not part of the schema.
 */
export const CanonicalPlaceSchema = {
    latitude: 'float',
    longitude: 'float',
    visitCount: 'number',
    memberCount: 'number',
    spanMeters: 'float',
    ambiguous: 'boolean',
    derived: 'boolean',
    // Indexed: replacing a module's output looks its previous nodes up by this.
    derivedBy: {
        type: 'string',
        indexed: true,
    },
    derivedVersion: 'number',
} satisfies SchemaObject;

export type CanonicalPlaceNodeType = InferGraphEntityType<typeof CanonicalPlaceSchema> & ASObjectNodeType;
