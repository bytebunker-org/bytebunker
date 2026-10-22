/** What an importer gets to see of a file when deciding whether it can read it. */
export interface FileSample {
    /** Path relative to the import root (watch folder or upload/zip root), with `/` separators. */
    relativePath: string;
    fileName: string;
    /** Lower-case extension without the dot, '' if none. */
    extension: string;
    size: number;
    /** The first {@link FILE_SAMPLE_HEAD_BYTES} bytes decoded as UTF-8 (may cut a character at the end). */
    head: string;
}

export interface FileDetection {
    /** 0…1. ≥ 0.9: certain (format signature), ≥ 0.5: likely. Below 0.5 is ignored. */
    confidence: number;
    /** Human readable format name, e.g. "Google Timeline (on-device export, 2024+)". */
    format: string;
}

export const FILE_SAMPLE_HEAD_BYTES = 64 * 1024;
export const FILE_DETECTION_MIN_CONFIDENCE = 0.5;
