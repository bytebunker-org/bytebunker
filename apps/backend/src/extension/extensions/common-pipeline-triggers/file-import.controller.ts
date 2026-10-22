import { Body, Controller, Logger, Post, UploadedFiles, UseInterceptors } from '@nestjs/common';
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

const UPLOAD_DIR = join(tmpdir(), 'bytebunker-import-uploads');
const MAX_FILES = 5000;

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
        const blueprintIds = body.blueprintIds
            ?.split(',')
            .map((id) => Number(id))
            .filter((id) => Number.isInteger(id));
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
