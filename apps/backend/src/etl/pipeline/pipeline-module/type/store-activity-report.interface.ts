import type { ActivityAnalysis } from '../../../../activity-graph/type/activity-analysis.interface.js';
import type { ActivityGraphSampleDto } from '../../../../activity-graph/type/create-activity-graph.interface.js';

/** The import report store-activity returns for real runs and dry runs alike. */
export interface StoreActivityReport {
    dryRun: boolean;
    /** Activities the module received. */
    activityCount: number;
    /** Activities written (or, in a dry run, that would be written). */
    createdCount: number;
    /** Activities skipped because a node with one of their stable keys exists (in the graph or earlier in the input). */
    existingCount: number;
    /** New object nodes: places, tracks, videos, … */
    createdObjectCount: number;
    samples: { created: ActivityGraphSampleDto[]; existing: ActivityGraphSampleDto[] };
    analysis: ActivityAnalysis;
}
