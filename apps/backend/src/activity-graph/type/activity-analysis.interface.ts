export interface ActivityAnalysis {
    activityCount: number;
    byType: Record<string, number>;
    /** Serialized size of `{ activities }`, i.e. roughly the JSONB row the transform node writes. */
    outputBytes: number;
    timeRange: { min?: string; max?: string };
    problems: {
        /** Hard: persisting throws on these. */
        unknownRelationshipKeys: Record<string, number>;
        /** Hard: required on every activity. */
        missingType: number;
        missingActor: number;
        missingOrInvalidStartTime: number;
        /** Hard: truncated keys can collide in the dedup index. */
        stableKeysTooLong: number;
        /** Soft: activity is never deduplicated. */
        activitiesWithoutStableKeys: number;
        /** Soft: ends before it starts. */
        endBeforeStart: number;
        /**
         * Soft: activities in this file that share a stable key with an earlier activity in the same file. The
         * persister only checks keys that already exist in Postgres, so these are all written as separate nodes
         * while the index keeps one of them: either real events collapsed by too-coarse keys, or duplicates.
         */
        intraFileDuplicateActivityKeys: number;
        /** Soft: activities sharing a key but with different content (data that the key cannot tell apart). */
        intraFileConflictingActivityKeys: number;
        /** Soft: objects without stable keys get a fresh node per activity. */
        objectsWithoutStableKeys: number;
        /**
         * Soft: object stable keys that link otherwise separate identities (key A seen with B once and with C
         * elsewhere). The persister resolves the first key it finds, so such objects merge unpredictably.
         */
        objectsWithConflictingKeySets: number;
        /** Soft: nested non-object values the persister flattens with JSON.stringify. */
        stringifiedProperties: Record<string, number>;
    };
    objects: {
        /** Object references across all activities. */
        references: number;
        /** Distinct objects, grouping references that share any stable key. */
        distinct: number;
        byType: Record<string, number>;
    };
    examples: Record<string, unknown[]>;
}
