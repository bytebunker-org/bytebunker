/**
 * Visit details kept on the `Arrive` activity of a Timeline.json visit (needed for home/work detection).
 */
export interface GoogleTimelineVisitInterface {
    /** 0 for a top-level visit, ≥ 1 for a visit nested inside another one (a shop inside a mall). */
    hierarchyLevel?: number;

    /** HOME, WORK, INFERRED_HOME, INFERRED_WORK, ALIASED_LOCATION, SEARCHED_ADDRESS or UNKNOWN. */
    semanticType?: string;
}
