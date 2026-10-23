import type { FileImportMatchSource } from './file-import-result.dto.js';

export class FileImportPreviewMatchDto {
    public blueprintId!: number;

    public blueprintTitle!: string;

    public matchedBy!: FileImportMatchSource;

    /** Set for content-detection matches: the format the importer recognised. */
    public format?: string;

    public confidence?: number;
}

export class FileImportPreviewDto {
    /** Path inside the upload or zip, with `/` separators. */
    public relativePath!: string;

    /** Size of the whole file, as reported by the client. */
    public size!: number;

    /** Blueprints importing the file would start; empty when nothing reads it. */
    public matches!: FileImportPreviewMatchDto[];

    /** Best guess of the format, also when nothing matched. */
    public format?: string;

    public confidence?: number;

    /** True when the format is recognised but no blueprint imports it yet. */
    public unsupportedFormat?: boolean;

    /** More than one blueprint would import the file. */
    public conflict!: boolean;

    /** Why nothing matched, or why the preview failed. */
    public message?: string;
}

export class FileImportPreviewBatchDto {
    public files!: FileImportPreviewDto[];
}
