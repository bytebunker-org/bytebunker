export type FileImportMatchSource = 'glob' | 'content-pattern' | 'content-detection';

export type FileImportOutcome = 'started' | 'dry-run' | 'skipped' | 'no-match' | 'ignored' | 'failed';

export class FileImportExecutionDto {
    public blueprintId!: number;

    public blueprintTitle!: string;

    public status!: 'created' | 'skipped' | 'failed';

    public executionId?: number;

    /** Why it was skipped or failed. */
    public reason?: string;
}

export class FileImportResultDto {
    /** Path inside the watch folder, upload or zip, with `/` separators. */
    public relativePath!: string;

    public size!: number;

    public outcome!: FileImportOutcome;

    /** How the file was routed to its blueprint(s). */
    public matchedBy?: FileImportMatchSource;

    /** Format reported by the importer (content detection) or by the known-format registry. */
    public format?: string;

    public confidence?: number;

    /** True when the format is recognised but no blueprint imports it yet. */
    public unsupportedFormat?: boolean;

    public executions!: FileImportExecutionDto[];

    /** Human readable explanation for no-match / failed outcomes. */
    public message?: string;
}

export class FileImportBatchResultDto {
    public dryRun!: boolean;

    public files!: FileImportResultDto[];

    /** Counts per outcome, for a one-line summary. */
    public summary!: Partial<Record<FileImportOutcome, number>>;
}
