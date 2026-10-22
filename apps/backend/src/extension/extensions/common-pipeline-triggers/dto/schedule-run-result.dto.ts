export class ScheduleRunResultDto {
    public outcome!: 'started' | 'skipped' | 'failed';

    /** The started executions, or the still running one that caused the skip. */
    public executionIds!: number[];

    public reason?: string;
}
