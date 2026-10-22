import { beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import type { EntityManager } from '@mikro-orm/postgresql';
import { moveFile } from 'move-file';
import { LocalFileTriggerService } from './local-file-trigger.service.js';
import type { SettingService } from '../../../shared/setting/setting.service.js';
import type { FileImportOutput, FileImportService } from './file-import.service.js';
import { PipelineExecutionStatusEnum } from '../../../etl/pipeline/type/pipeline-execution-status.enum.js';

vi.mock('move-file', () => ({
    moveFile: vi.fn(() => Promise.resolve()),
}));

vi.mock('chokidar', () => ({
    watch: vi.fn(() => ({ on: vi.fn(), close: vi.fn() })),
}));

vi.mock('node:fs/promises', () => ({
    default: { mkdir: vi.fn(() => Promise.resolve()) },
}));

const IMPORT_FOLDER = './data/import';
const FINISHED_FOLDER = './data/import-finished';
const FAILED_FOLDER = './data/import-failed';
const FILE_PATH = 'calendar.ics';

const importPath = () => path.resolve(process.cwd(), IMPORT_FOLDER, FILE_PATH);
const finishedPath = () => path.resolve(process.cwd(), FINISHED_FOLDER, FILE_PATH);
const failedPath = () => path.resolve(process.cwd(), FAILED_FOLDER, FILE_PATH);

function importResult(partial: Partial<FileImportOutput>): FileImportOutput {
    return { relativePath: FILE_PATH, size: 10, outcome: 'started', executions: [], triggerResults: [], ...partial };
}

describe('LocalFileTriggerService', () => {
    let service: LocalFileTriggerService;
    let importFile: ReturnType<typeof vi.fn>;
    let isIgnored: ReturnType<typeof vi.fn>;
    let getSettingValues: ReturnType<typeof vi.fn>;
    let logSpy: ReturnType<typeof vi.spyOn>;
    let errorSpy: ReturnType<typeof vi.spyOn>;

    function handleFile(): Promise<void> {
        return (service as unknown as { onFileAdded(path: string): Promise<void> }).onFileAdded(FILE_PATH);
    }

    beforeEach(async () => {
        vi.mocked(moveFile).mockClear();

        const em = {
            transactional: <T>(callback: (em: EntityManager) => Promise<T>) => callback(em as never),
        } as unknown as EntityManager;

        importFile = vi.fn().mockResolvedValue(importResult({ outcome: 'started' }));
        isIgnored = vi.fn().mockReturnValue(false);
        getSettingValues = vi.fn().mockResolvedValue({
            localFileTriggerImportFolderSetting: IMPORT_FOLDER,
            localFileTriggerImportFinishedFolderSetting: FINISHED_FOLDER,
            localFileTriggerImportFailedFolderSetting: FAILED_FOLDER,
        });

        service = new LocalFileTriggerService(
            em,
            { getSettingValues } as unknown as SettingService,
            { importFile, isIgnored } as unknown as FileImportService,
        );

        logSpy = vi.spyOn(service['logger'], 'log').mockImplementation(() => undefined);
        errorSpy = vi.spyOn(service['logger'], 'error').mockImplementation(() => undefined);

        await service.onApplicationBootstrap();
    });

    it('reads the folder settings once at boot, not per file', async () => {
        await handleFile();
        await handleFile();

        expect(getSettingValues).toHaveBeenCalledOnce();
    });

    it('hands the file to the import service with its path relative to the import folder', async () => {
        await handleFile();

        expect(importFile).toHaveBeenCalledWith({ absolutePath: importPath(), relativePath: FILE_PATH });
    });

    it('moves a file that started a pipeline to the finished folder', async () => {
        await handleFile();

        expect(moveFile).toHaveBeenCalledExactlyOnceWith(importPath(), finishedPath());
        expect(errorSpy).not.toHaveBeenCalled();
    });

    it('moves a duplicate import to the finished folder and explains it at info level', async () => {
        importFile.mockResolvedValue(
            importResult({
                outcome: 'skipped',
                triggerResults: [
                    {
                        status: 'skipped',
                        blueprintId: 7,
                        blueprintTitle: 'Import calendar',
                        nodeId: 3,
                        existingExecutionId: 42,
                        existingExecutionStatus: PipelineExecutionStatusEnum.SUCCESS,
                        reason: 'already imported by execution 42',
                    },
                ],
            }),
        );

        await handleFile();

        expect(moveFile).toHaveBeenCalledExactlyOnceWith(importPath(), finishedPath());
        const message = logSpy.mock.calls.at(-1)?.[0] as string;
        expect(message).toContain('skipped as a duplicate import');
        expect(message).toContain('blueprint "Import calendar" (7)');
        expect(message).toContain('allowReimport');
        expect(errorSpy).not.toHaveBeenCalled();
    });

    it('moves an unmatched file to the failed folder with the explanation', async () => {
        importFile.mockResolvedValue(
            importResult({
                outcome: 'no-match',
                message: 'Looks like Google Fit; no blueprint imports this format yet.',
            }),
        );

        await handleFile();

        expect(moveFile).toHaveBeenCalledExactlyOnceWith(importPath(), failedPath());
        expect(errorSpy.mock.calls.at(-1)?.[0]).toContain('Looks like Google Fit');
    });

    it('moves media files to the failed folder without routing them', async () => {
        isIgnored.mockReturnValue(true);

        await handleFile();

        expect(importFile).not.toHaveBeenCalled();
        expect(moveFile).toHaveBeenCalledExactlyOnceWith(importPath(), failedPath());
    });
});
