/** Where newly created nodes came from. Stored on create only, so a node keeps its original origin. */
export interface ImportProvenance {
    /** Pipeline execution that created the node. */
    executionId: number;
    /** Asset (the imported file) the execution was triggered from, if any. */
    assetId?: string;
}

export interface CreateActivityGraphOptions {
    /** Resolve everything against the existing graph and count, but write nothing. */
    dryRun?: boolean;
    provenance?: ImportProvenance;
    onProgress?: (progress: { processed: number; total: number; created: number; existing: number }) => void;
    /** How many created/existing activities to return as examples. */
    sampleSize?: number;
}

export interface ActivityGraphSampleDto {
    type: string;
    startTime?: string;
    summary?: string;
    objects: Record<string, string>;
}

export interface CreateActivityGraphResult {
    createdCount: number;
    existingCount: number;
    /** Object nodes (places, tracks, …) that did not exist before. */
    createdObjectCount: number;
    dryRun: boolean;
    samples: { created: ActivityGraphSampleDto[]; existing: ActivityGraphSampleDto[] };
}
