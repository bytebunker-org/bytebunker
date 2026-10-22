export type CoverageGroupBy = 'source' | 'type';

export class CoverageSeriesDto {
    /** Extension name (groupBy=source) or activity type label (groupBy=type); `all` for the combined series. */
    public key!: string;

    public label!: string;

    public total!: number;

    /** First / last day (YYYY-MM-DD) with data; undefined for an empty series. */
    public firstDay?: string;

    public lastDay?: string;

    /** Activity count per day (YYYY-MM-DD); days without data are absent. */
    public days!: Record<string, number>;
}

export class CoverageGapDto {
    public key!: string;

    /** First and last day (YYYY-MM-DD) of the gap, both without data. */
    public from!: string;

    public to!: string;

    public days!: number;
}

export class CoverageResponseDto {
    public from?: string;

    public to?: string;

    public groupBy!: CoverageGroupBy;

    public minGapDays!: number;

    /** Everything combined; counts each activity once, unlike the sum of `series` when groupBy=type. */
    public overall!: CoverageSeriesDto;

    public series!: CoverageSeriesDto[];

    public gaps!: CoverageGapDto[];
}
