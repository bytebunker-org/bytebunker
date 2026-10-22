export class ImportProvenanceSummaryDto {
    public executionId?: number;

    public assetId?: string;

    /** Nodes created by the import, per label (an activity counts for each of its labels). */
    public nodeCounts!: Record<string, number>;

    public activityCount!: number;

    public objectCount!: number;

    /** Earliest / latest activity start time among the created activities (ISO). */
    public firstActivityAt?: string;

    public lastActivityAt?: string;
}
