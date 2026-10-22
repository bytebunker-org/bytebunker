import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Stats } from 'node:fs';
import path from 'node:path';
import type { EntityManager } from '@mikro-orm/postgresql';
import { moveFile } from 'move-file';
import { LocalFileTriggerService } from './local-file-trigger.service.js';
import type { PipelineTriggerService } from '../../../etl/pipeline/execution/pipeline-trigger.service.js';
import type { SettingService } from '../../../shared/setting/setting.service.js';
import type { AssetService } from '../../../etl/asset/asset.service.js';
import type { PipelineTriggerResult } from '../../../etl/pipeline/execution/pipeline-trigger-result.type.js';
import { PipelineExecutionStatusEnum } from '../../../etl/pipeline/type/pipeline-execution-status.enum.js';

vi.mock('move-file', () => ({
    moveFile: vi.fn(() => Promise.resolve()),
}));

const IMPORT_FOLDER = './data/import';
const FINISHED_FOLDER = './data/import-finished';
const FAILED_FOLDER = './data/import-failed';
const FILE_PATH = 'calendar.ics';

const finishedPath = () => path.join(process.cwd(), FINISHED_FOLDER, FILE_PATH);
const failedPath = () => path.join(process.cwd(), FAILED_FOLDER, FILE_PATH);

const createdResult: PipelineTriggerResult = {
    status: 'created',
    blueprintId: 7,
    blueprintTitle: 'Import calendar',
    nodeId: 3,
    execution: { id: 100 } as never,
};

const skippedResult: PipelineTriggerResult = {
    status: 'skipped',
    blueprintId: 7,
    blueprintTitle: 'Import calendar',
    nodeId: 3,
    existingExecutionId: 42,
    existingExecutionStatus: PipelineExecutionStatusEnum.SUCCESS,
    reason: 'already imported by execution 42 at 2026-01-01T10:00:00.000Z',
};

describe('LocalFileTriggerService', () => {
    let service: LocalFileTriggerService;
    let executeBlueprintFromTrigger: ReturnType<typeof vi.fn>;
    let logSpy: ReturnType<typeof vi.spyOn>;
    let errorSpy: ReturnType<typeof vi.spyOn>;

    function handleFile(): Promise<void> {
        return (service as unknown as { onFileAdded(path: string, stats: Stats): Promise<void> }).onFileAdded(
            FILE_PATH,
            { size: 1234 } as Stats,
        );
    }

    beforeEach(() => {
        vi.mocked(moveFile).mockClear();

        const forkedEm = {
            transactional: <T>(callback: (em: EntityManager) => Promise<T>) => callback(forkedEm as never),
        };
        const em = { fork: () => forkedEm } as unknown as EntityManager;

        executeBlueprintFromTrigger = vi.fn().mockResolvedValue([createdResult]);

        const pipelineTriggerService = { executeBlueprintFromTrigger } as unknown as PipelineTriggerService;
        const settingService = {
            getSettingValues: vi.fn().mockResolvedValue({
                localFileTriggerImportFolderSetting: IMPORT_FOLDER,
                localFileTriggerImportFinishedFolderSetting: FINISHED_FOLDER,
                localFileTriggerImportFailedFolderSetting: FAILED_FOLDER,
            }),
        } as unknown as SettingService;
        const assetService = { storeAssetFromLocalFile: vi.fn() } as unknown as AssetService;

        service = new LocalFileTriggerService(em, pipelineTriggerService, settingService, assetService);

        logSpy = vi.spyOn(service['logger'], 'log').mockImplementation(() => undefined);
        errorSpy = vi.spyOn(service['logger'], 'error').mockImplementation(() => undefined);
    });

    it('moves a file that started a pipeline to the finished folder', async () => {
        await handleFile();

        expect(moveFile).toHaveBeenCalledOnce();
        expect(moveFile).toHaveBeenCalledWith(path.join(process.cwd(), IMPORT_FOLDER, FILE_PATH), finishedPath());
        expect(errorSpy).not.toHaveBeenCalled();
    });

    it('moves a duplicate import to the finished folder instead of the failed folder', async () => {
        executeBlueprintFromTrigger.mockResolvedValue([skippedResult]);

        await handleFile();

        expect(moveFile).toHaveBeenCalledOnce();
        expect(moveFile).toHaveBeenCalledWith(path.join(process.cwd(), IMPORT_FOLDER, FILE_PATH), finishedPath());
        expect(moveFile).not.toHaveBeenCalledWith(expect.anything(), failedPath());
        expect(errorSpy).not.toHaveBeenCalled();
    });

    it('explains a duplicate import at info level, naming blueprint, execution and the escape hatch', async () => {
        executeBlueprintFromTrigger.mockResolvedValue([skippedResult]);

        await handleFile();

        const message = logSpy.mock.calls.at(-1)?.[0] as string;

        expect(message).toContain('skipped as a duplicate import');
        expect(message).toContain('blueprint "Import calendar" (7)');
        expect(message).toContain('already imported by execution 42');
        expect(message).toContain('allowReimport');
    });

    it('still moves a file to the failed folder when no blueprint matched at all', async () => {
        executeBlueprintFromTrigger.mockResolvedValue([]);

        await handleFile();

        expect(moveFile).toHaveBeenCalledOnce();
        expect(moveFile).toHaveBeenCalledWith(path.join(process.cwd(), IMPORT_FOLDER, FILE_PATH), failedPath());
        expect(errorSpy).toHaveBeenCalled();
    });

    it('wires the imported asset and the per-blueprint allowReimport flag into the trigger service', async () => {
        await handleFile();

        const options = executeBlueprintFromTrigger.mock.calls[0]![2] as {
            resolveTriggerAsset: (output: { fileAsset: { id: string } }) => string | undefined;
            allowReimport: (context: { node: { constantInputData?: { allowReimport?: boolean } } }) => boolean;
        };

        expect(options.resolveTriggerAsset({ fileAsset: { id: 'asset-1' } })).toBe('asset-1');
        expect(options.allowReimport({ node: { constantInputData: { allowReimport: true } } })).toBe(true);
        expect(options.allowReimport({ node: { constantInputData: {} } })).toBe(false);
        expect(options.allowReimport({ node: {} })).toBe(false);
    });
});
