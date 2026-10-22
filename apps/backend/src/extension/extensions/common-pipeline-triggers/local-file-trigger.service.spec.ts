import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import fs from 'node:fs/promises';
import type { EntityManager } from '@mikro-orm/postgresql';
import { moveFile } from 'move-file';
import { LocalFileTriggerService } from './local-file-trigger.service.js';
import type { SettingService } from '../../../shared/setting/setting.service.js';
import type { FileImportOutput, FileImportService } from './file-import.service.js';
import type { AssetService } from '../../../etl/asset/asset.service.js';
import { PipelineExecutionStatusEnum } from '../../../etl/pipeline/type/pipeline-execution-status.enum.js';

vi.mock('move-file', () => ({
    moveFile: vi.fn(() => Promise.resolve()),
}));

vi.mock('chokidar', () => ({
    watch: vi.fn(() => ({ on: vi.fn(), close: vi.fn() })),
}));

vi.mock('node:fs/promises', () => ({
    default: {
        mkdir: vi.fn(() => Promise.resolve()),
        readdir: vi.fn(() => Promise.resolve([])),
        readFile: vi.fn(() => Promise.resolve(Buffer.from('content'))),
        stat: vi.fn(() => Promise.resolve({ mtimeMs: 0, ctimeMs: 0 })),
    },
}));

const IMPORT_FOLDER = './data/import';
const FINISHED_FOLDER = './data/import-finished';
const FAILED_FOLDER = './data/import-failed';
const FILE_PATH = 'calendar.ics';

const importPath = () => path.resolve(process.cwd(), IMPORT_FOLDER, FILE_PATH);
const processingFolder = () => `${path.resolve(process.cwd(), IMPORT_FOLDER)}-processing`;
const processingPath = () => path.join(processingFolder(), FILE_PATH);
const finishedPath = () => path.resolve(process.cwd(), FINISHED_FOLDER, FILE_PATH);
const failedPath = () => path.resolve(process.cwd(), FAILED_FOLDER, FILE_PATH);

function importResult(partial: Partial<FileImportOutput>): FileImportOutput {
    return { relativePath: FILE_PATH, size: 10, outcome: 'started', executions: [], triggerResults: [], ...partial };
}

function startedResult(...executions: { executionId?: number; status: 'created' | 'failed' }[]): FileImportOutput {
    return importResult({
        outcome: 'started',
        executions: executions.map((execution, index) => ({
            blueprintId: index,
            blueprintTitle: `Blueprint ${index}`,
            ...execution,
        })),
    });
}

describe('LocalFileTriggerService', () => {
    let service: LocalFileTriggerService;
    let importFile: ReturnType<typeof vi.fn>;
    let isIgnored: ReturnType<typeof vi.fn>;
    let getSettingValues: ReturnType<typeof vi.fn>;
    let findByContent: ReturnType<typeof vi.fn>;
    let find: ReturnType<typeof vi.fn>;
    let logSpy: ReturnType<typeof vi.spyOn>;
    let errorSpy: ReturnType<typeof vi.spyOn>;

    function handleFile(): Promise<void> {
        return (service as unknown as { onFileAdded(path: string): Promise<void> }).onFileAdded(FILE_PATH);
    }

    function reconcile(): Promise<void> {
        return (service as unknown as { reconcileProcessingFolder(): Promise<void> }).reconcileProcessingFolder();
    }

    /** Execution rows as the status check reads them. */
    function executionsWithStatus(...statuses: PipelineExecutionStatusEnum[]) {
        find.mockResolvedValue(statuses.map((executionStatus, index) => ({ id: index + 1, executionStatus })));
    }

    beforeEach(async () => {
        vi.mocked(moveFile).mockClear();
        vi.mocked(fs.readdir).mockResolvedValue([]);

        find = vi.fn().mockResolvedValue([]);
        const em = {
            transactional: <T>(callback: (em: EntityManager) => Promise<T>) => callback(em as never),
            fork: () => ({ find }),
        } as unknown as EntityManager;

        importFile = vi.fn().mockResolvedValue(startedResult({ executionId: 1, status: 'created' }));
        isIgnored = vi.fn().mockReturnValue(false);
        getSettingValues = vi.fn().mockResolvedValue({
            localFileTriggerImportFolderSetting: IMPORT_FOLDER,
            localFileTriggerImportFinishedFolderSetting: FINISHED_FOLDER,
            localFileTriggerImportFailedFolderSetting: FAILED_FOLDER,
        });
        findByContent = vi.fn().mockResolvedValue(null);

        service = new LocalFileTriggerService(
            em,
            { getSettingValues } as unknown as SettingService,
            { importFile, isIgnored } as unknown as FileImportService,
            { findByContent } as unknown as AssetService,
        );

        logSpy = vi.spyOn(service['logger'], 'log').mockImplementation(() => undefined);
        errorSpy = vi.spyOn(service['logger'], 'error').mockImplementation(() => undefined);

        await service.onApplicationBootstrap();
        // Let the boot reconcile (empty folder) settle before the test starts.
        await new Promise((resolve) => setImmediate(resolve));
    });

    afterEach(async () => {
        await service.onApplicationShutdown();
    });

    it('reads the folder settings once at boot, not per file', async () => {
        await handleFile();
        await handleFile();

        expect(getSettingValues).toHaveBeenCalledOnce();
    });

    it('creates the processing folder next to the import folder at boot', () => {
        expect(fs.mkdir).toHaveBeenCalledWith(processingFolder(), { recursive: true });
    });

    it('moves the file to processing and imports it from there, keeping the relative path', async () => {
        await handleFile();

        expect(moveFile).toHaveBeenCalledExactlyOnceWith(importPath(), processingPath());
        expect(importFile).toHaveBeenCalledWith({ absolutePath: processingPath(), relativePath: FILE_PATH });
    });

    it('keeps the file in processing while its executions run', async () => {
        await handleFile();
        executionsWithStatus(PipelineExecutionStatusEnum.WAITING);

        await service.checkProcessingFiles();

        expect(moveFile).toHaveBeenCalledOnce();
    });

    it('moves the file to finished once all its executions succeeded', async () => {
        importFile.mockResolvedValue(
            startedResult({ executionId: 1, status: 'created' }, { executionId: 2, status: 'created' }),
        );
        await handleFile();
        executionsWithStatus(PipelineExecutionStatusEnum.SUCCESS, PipelineExecutionStatusEnum.WAITING);
        await service.checkProcessingFiles();
        executionsWithStatus(PipelineExecutionStatusEnum.SUCCESS, PipelineExecutionStatusEnum.SUCCESS);

        await service.checkProcessingFiles();

        expect(vi.mocked(moveFile).mock.calls.at(-1)).toEqual([processingPath(), finishedPath()]);
        expect(moveFile).toHaveBeenCalledTimes(2);
    });

    it.each([PipelineExecutionStatusEnum.FAILED, PipelineExecutionStatusEnum.ABORTED])(
        'moves the file to failed when an execution ended %s',
        async (status) => {
            importFile.mockResolvedValue(
                startedResult({ executionId: 1, status: 'created' }, { executionId: 2, status: 'created' }),
            );
            await handleFile();
            executionsWithStatus(PipelineExecutionStatusEnum.SUCCESS, status);

            await service.checkProcessingFiles();

            expect(vi.mocked(moveFile).mock.calls.at(-1)).toEqual([processingPath(), failedPath()]);
            expect(errorSpy).toHaveBeenCalled();
        },
    );

    it('moves the file to failed when one blueprint could not create its execution', async () => {
        importFile.mockResolvedValue(startedResult({ executionId: 1, status: 'created' }, { status: 'failed' }));
        await handleFile();
        executionsWithStatus(PipelineExecutionStatusEnum.SUCCESS);

        await service.checkProcessingFiles();

        expect(vi.mocked(moveFile).mock.calls.at(-1)).toEqual([processingPath(), failedPath()]);
    });

    it('moves a duplicate import to the finished folder right away and explains it at info level', async () => {
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

        expect(vi.mocked(moveFile).mock.calls).toEqual([
            [importPath(), processingPath()],
            [processingPath(), finishedPath()],
        ]);
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

        expect(vi.mocked(moveFile).mock.calls.at(-1)).toEqual([processingPath(), failedPath()]);
        expect(errorSpy.mock.calls.at(-1)?.[0]).toContain('Looks like Google Fit');
    });

    it('moves media files to the failed folder without routing them', async () => {
        isIgnored.mockReturnValue(true);

        await handleFile();

        expect(importFile).not.toHaveBeenCalled();
        expect(moveFile).toHaveBeenCalledExactlyOnceWith(importPath(), failedPath());
    });

    describe('sweep of the import folder', () => {
        function sweep(): Promise<void> {
            return service.sweepImportFolder();
        }

        function folderContains(...files: { name: string; dir?: string }[]) {
            vi.mocked(fs.readdir).mockResolvedValueOnce(
                files.map(({ name, dir = '' }) => ({
                    name,
                    parentPath: path.join(path.resolve(process.cwd(), IMPORT_FOLDER), dir),
                    isFile: () => true,
                })) as never,
            );
        }

        it('imports a file the watcher missed once it has settled', async () => {
            folderContains({ name: 'MeineAktivitäten.html', dir: 'Google Pay' });

            await sweep();
            await new Promise((resolve) => setImmediate(resolve));

            expect(importFile).toHaveBeenCalledWith(
                expect.objectContaining({ relativePath: path.join('Google Pay', 'MeineAktivitäten.html') }),
            );
        });

        it('leaves a file alone that was written moments ago', async () => {
            vi.mocked(fs.stat).mockResolvedValueOnce({ mtimeMs: Date.now(), ctimeMs: Date.now() } as never);
            folderContains({ name: FILE_PATH });

            await sweep();
            await new Promise((resolve) => setImmediate(resolve));

            expect(importFile).not.toHaveBeenCalled();
        });
    });

    describe('after a restart', () => {
        beforeEach(() => {
            vi.mocked(fs.readdir).mockResolvedValue([
                { name: FILE_PATH, parentPath: processingFolder(), isFile: () => true },
            ] as never);
        });

        it('tracks a leftover file through the executions of its trigger asset (latest per blueprint)', async () => {
            findByContent.mockResolvedValue({ id: 'asset-1' });
            find.mockImplementation((_entity: unknown, where: Record<string, unknown>) =>
                Promise.resolve(
                    'triggerAsset' in where
                        ? [
                              { id: 30, blueprint: { id: 1 } },
                              { id: 20, blueprint: { id: 1 } },
                              { id: 10, blueprint: { id: 2 } },
                          ]
                        : [
                              { id: 30, executionStatus: PipelineExecutionStatusEnum.SUCCESS },
                              { id: 10, executionStatus: PipelineExecutionStatusEnum.SUCCESS },
                          ],
                ),
            );

            await reconcile();

            expect(find.mock.calls.at(-1)?.[1]).toEqual({ id: { $in: [30, 10] } });
            expect(importFile).not.toHaveBeenCalled();
            expect(moveFile).toHaveBeenCalledExactlyOnceWith(processingPath(), finishedPath());
        });

        it('imports a leftover file again when its executions were never committed', async () => {
            await reconcile();

            expect(importFile).toHaveBeenCalledWith({ absolutePath: processingPath(), relativePath: FILE_PATH });
        });
    });
});
