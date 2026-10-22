export interface ModuleProgressUpdate {
    /** Units processed so far (rows, activities, bytes …). */
    current?: number;

    /** Total units, if known. Without it the node shows an indeterminate progress bar. */
    total?: number;

    /** What `current`/`total` count, shown next to the numbers, e.g. "activities". */
    unit?: string;

    /** Short human readable status line, e.g. "Parsing Timeline.json" or "Writing chunk 3/12". */
    message?: string;
}

/**
 * Handed to every module in its execution context. Reporting is optional and cheap: updates are throttled
 * before they are written, so a module can call `report` once per row.
 */
export interface ModuleProgressReporter {
    report(update: ModuleProgressUpdate): void;

    /** Shorthand for `report({ message })`. */
    message(message: string): void;
}

export const NOOP_MODULE_PROGRESS_REPORTER: ModuleProgressReporter = {
    report: () => undefined,
    message: () => undefined,
};
