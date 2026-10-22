import type { ImportProvenance } from './create-activity-graph.interface.js';

export interface UpsertObjectsOptions {
    /** Resolve everything against the existing graph and count, but write nothing. */
    dryRun?: boolean;
    provenance?: ImportProvenance;
    onProgress?: (progress: { processed: number; total: number; created: number; updated: number }) => void;
}

export interface UpsertObjectsResult {
    /** Objects that got a new node. */
    createdCount: number;
    /** Objects whose node already existed (by stable key, in the graph or earlier in the same call) and was updated. */
    updatedCount: number;
    /**
     * Stable keys of an object that are already indexed to a different node than the one the object resolved to.
     * They stay where they are; a non-zero count usually means two nodes describe the same thing (e.g. two persons
     * merged in my-hub that were separate nodes here).
     */
    conflictingKeyCount: number;
    dryRun: boolean;
}
