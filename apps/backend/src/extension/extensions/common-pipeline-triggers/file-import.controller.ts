import {
    BadRequestException,
    Body,
    Controller,
    HttpCode,
    Logger,
    Post,
    UploadedFiles,
    UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { v7 as uuidV7 } from 'uuid';
import { FileImportService } from './file-import.service.js';
import { extractZip } from '../../../etl/import/zip.util.js';
import { FileImportBatchResultDto, type FileImportResultDto } from '../../../etl/import/dto/file-import-result.dto.js';
import { FileImportPreviewBatchDto } from '../../../etl/import/dto/file-import-preview.dto.js';
import { buildFileSampleFromHead } from '../../../etl/import/file-sample.util.js';
import { FILE_SAMPLE_HEAD_BYTES } from '../../../etl/import/type/file-detection.interface.js';

const UPLOAD_DIR = join(tmpdir(), 'bytebunker-import-uploads');
const MAX_FILES = 5000;

/** Heads per preview request; the UI sends batches well below this. */
/** Heads are held in memory: 500 × 256 KB caps one request at ~128 MB. The UI sends at most 400 per request. */
const MAX_PREVIEW_FILES = 500;

const toBoolean = ({ value }: { value: unknown }) => value === true || value === 'true' || value === '1';

class ImportUploadDto {
    /** Run every module but write nothing; the executions report what they would create. */
    @IsOptional()
    @Transform(toBoolean)
    @IsBoolean()
    public dryRun?: boolean;

    /** Re-run blueprints even for content that was imported before. */
    @IsOptional()
    @Transform(toBoolean)
    @IsBoolean()
    public allowReimport?: boolean;

    /**
     * JSON array with the relative path of each uploaded file (same order as `files`), e.g. from a folder drop.
     * Without it the original file names are used.
     */
    @IsOptional()
    @IsString()
    public paths?: string;

    /** Comma-separated blueprint ids to restrict routing to. */
    @IsOptional()
    @IsString()
    public blueprintIds?: string;
}

class ImportPreviewDto {
    /** JSON array with the relative path of each head (same order as `files`). */
    @IsString()
    public paths!: string;

    /** JSON array with the full size in bytes of each file (same order as `files`). */
    @IsString()
    public sizes!: string;

    /** Comma-separated blueprint ids to restrict routing to. */
    @IsOptional()
    @IsString()
    public blueprintIds?: string;
}

function parseBlueprintIds(value?: string): number[] | undefined {
    return value
        ?.split(',')
        .map(Number)
        .filter((id) => Number.isInteger(id));
}

function parseJsonArray<T>(name: string, value: string): T[] {
    try {
        const parsed: unknown = JSON.parse(value);

        if (Array.isArray(parsed)) {
            return parsed as T[];
        }
    } catch {
        /* fall through */
    }

    throw new BadRequestException(`${name} must be a JSON array`);
}

@Controller('imports')
export class FileImportController {
    private readonly logger = new Logger(FileImportController.name);

    constructor(private readonly fileImportService: FileImportService) {}

    @Post()
    @ApiOperation({
        summary:
            'Upload files (or zip archives, e.g. a whole takeout) to import. Each file is routed to the blueprints ' +
            'that read it, by path or by content. With dryRun nothing is written.',
    })
    @ApiConsumes('multipart/form-data')
    @ApiResponse({ status: 201, type: FileImportBatchResultDto })
    @UseInterceptors(FilesInterceptor('files', MAX_FILES, { dest: UPLOAD_DIR }))
    public async upload(
        @UploadedFiles() files: Express.Multer.File[],
        @Body() body: ImportUploadDto,
    ): Promise<FileImportBatchResultDto> {
        const paths = body.paths ? (JSON.parse(body.paths) as string[]) : [];
        const blueprintIds = parseBlueprintIds(body.blueprintIds);
        const options = { dryRun: body.dryRun ?? false, allowReimport: body.allowReimport, blueprintIds };
        const results: FileImportResultDto[] = [];

        try {
            for (const [index, file] of (files ?? []).entries()) {
                const relativePath = (paths[index] ?? file.originalname).replace(/^\/+/, '');

                if (/\.zip$/i.test(relativePath)) {
                    results.push(...(await this.importZip(file.path, relativePath, options)));
                } else {
                    results.push(await this.importOne(file.path, relativePath, file.size, options));
                }
            }
        } finally {
            await Promise.all((files ?? []).map((file) => fs.rm(file.path, { force: true })));
        }

        const summary: FileImportBatchResultDto['summary'] = {};

        for (const result of results) {
            summary[result.outcome] = (summary[result.outcome] ?? 0) + 1;
        }

        return { dryRun: options.dryRun, files: results, summary };
    }

    @Post('preview')
    @HttpCode(200)
    @ApiOperation({
        summary:
            'Route files by their first bytes only, before uploading them: which blueprints would import each file, ' +
            'its recognised format, conflicts. Send at most the first FILE_SAMPLE_HEAD_BYTES of each file (zip ' +
            'entries already extracted by the client). Nothing is stored.',
    })
    @ApiConsumes('multipart/form-data')
    @ApiResponse({ status: 200, type: FileImportPreviewBatchDto })
    @UseInterceptors(
        // No `dest`: multer keeps the (small) heads in memory. Busboy rejects a part that reaches `fileSize`, so a
        // head of exactly FILE_SAMPLE_HEAD_BYTES (any file at least that big) needs one byte of headroom.
        FilesInterceptor('files', MAX_PREVIEW_FILES, {
            limits: { fileSize: FILE_SAMPLE_HEAD_BYTES + 1, fieldSize: 2 * 1024 * 1024 },
        }),
    )
    public async preview(
        @UploadedFiles() files: Express.Multer.File[],
        @Body() body: ImportPreviewDto,
    ): Promise<FileImportPreviewBatchDto> {
        const paths = parseJsonArray<string>('paths', body.paths);
        const sizes = parseJsonArray<number>('sizes', body.sizes);
        const blueprintIds = parseBlueprintIds(body.blueprintIds);

        if (paths.length !== (files ?? []).length || sizes.length !== paths.length) {
            throw new BadRequestException('paths, sizes and files must have the same length');
        }

        const samples = (files ?? []).map((file, index) =>
            buildFileSampleFromHead(
                String(paths[index]).replace(/^\/+/, ''),
                Number(sizes[index]) || file.size,
                file.buffer,
            ),
        );

        return { files: await this.fileImportService.previewSamples(samples, blueprintIds) };
    }

    private async importZip(
        zipPath: string,
        zipName: string,
        options: { dryRun: boolean; allowReimport?: boolean; blueprintIds?: number[] },
    ): Promise<FileImportResultDto[]> {
        const extractDir = join(UPLOAD_DIR, `zip-${uuidV7()}`);
        const results: FileImportResultDto[] = [];

        try {
            const { extracted, skipped } = await extractZip(
                zipPath,
                extractDir,
                (path) => !this.fileImportService.isIgnored(path),
            );
            this.logger.log(
                `Extracted ${extracted.length} files from ${zipName} (${skipped.length} media/system files skipped)`,
            );

            for (const path of skipped) {
                results.push(this.fileImportService.ignoredResult(path, 0));
            }

            for (const path of extracted) {
                const { size } = await fs.stat(join(extractDir, path));
                results.push(await this.importOne(join(extractDir, path), path, size, options));
            }
        } finally {
            await fs.rm(extractDir, { recursive: true, force: true });
        }

        return results;
    }

    private async importOne(
        absolutePath: string,
        relativePath: string,
        size: number,
        options: { dryRun: boolean; allowReimport?: boolean; blueprintIds?: number[] },
    ): Promise<FileImportResultDto> {
        if (this.fileImportService.isIgnored(relativePath)) {
            return this.fileImportService.ignoredResult(relativePath, size);
        }

        // Strip the internal routing details; the DTO is what the UI shows.
        const {
            routing: _routing,
            triggerResults: _triggerResults,
            ...result
        } = await this.fileImportService.importFile({
            absolutePath,
            relativePath,
            ...options,
        });

        return result;
    }
}
