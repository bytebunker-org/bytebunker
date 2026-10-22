import { Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { type FSWatcher, watch } from 'chokidar';
import { SettingService } from '../../../shared/setting/setting.service.js';
import fs from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { moveFile } from 'move-file';
import type { SkippedPipelineTriggerResult } from '../../../etl/pipeline/execution/pipeline-trigger-result.type.js';
import { PipelineExecutionEntity } from '../../../etl/pipeline/entity/pipeline-execution.entity.js';
import { PipelineExecutionStatusEnum } from '../../../etl/pipeline/type/pipeline-execution-status.enum.js';
import { AssetService } from '../../../etl/asset/asset.service.js';
import { AssetTypeEnum } from '../../../etl/asset/type/asset-type.enum.js';
import { FileImportService } from './file-import.service.js';

interface ImportFolders {
    import: string;
    /** Files whose executions are still running. Derived from the import folder, not a setting. */
    processing: string;
    finished: string;
    failed: string;
}

/** A file in the processing folder and the executions that decide where it goes. */
interface ProcessingFile {
    executionIds: number[];
    /** Some matching blueprint could not even create its execution. */
    hadCreationFailure: boolean;
}

const CHECK_INTERVAL_MS = 5000;

/**
 * Watches the import folder and hands every new file to {@link FileImportService}. The file moves to the processing
 * folder first and stays there while its executions run; once all of them ended it moves to the finished folder
 * (all succeeded, or the file was skipped as an already imported duplicate) or to the failed folder.
 *
 * Which executions belong to a file is kept in memory and rebuilt at boot from the files left in the processing
 * folder: their content hash leads to the trigger asset, and from there to the executions.
 */
@Injectable()
export class LocalFileTriggerService implements OnApplicationBootstrap, OnApplicationShutdown {
    private readonly logger = new Logger(LocalFileTriggerService.name);
    private watcher: FSWatcher | undefined;
    /**
     * Resolved once at boot. Reading the settings per file hit the settings cache after its TTL expired, which
     * returned the default folders and lost the file. Changing the folders needs a restart (as the watcher did).
     */
    private folders: ImportFolders | undefined;
    /** Keyed by the path relative to the import (and processing) folder. */
    private readonly processingFiles = new Map<string, ProcessingFile>();
    private checkTimer: NodeJS.Timeout | undefined;
    private checking: Promise<void> | undefined;

    constructor(
        private readonly em: EntityManager,
        private readonly settingService: SettingService,
        private readonly fileImportService: FileImportService,
        private readonly assetService: AssetService,
    ) {}

    public async onApplicationBootstrap(): Promise<void> {
        await this.em.transactional(async (em) => {
            const {
                localFileTriggerImportFolderSetting,
                localFileTriggerImportFinishedFolderSetting,
                localFileTriggerImportFailedFolderSetting,
            } = await this.settingService.getSettingValues(em, [
                'localFileTriggerImportFolder',
                'localFileTriggerImportFinishedFolder',
                'localFileTriggerImportFailedFolder',
            ]);

            const importFolder = resolve(process.cwd(), localFileTriggerImportFolderSetting);

            this.folders = {
                import: importFolder,
                processing: `${importFolder}-processing`,
                finished: resolve(process.cwd(), localFileTriggerImportFinishedFolderSetting),
                failed: resolve(process.cwd(), localFileTriggerImportFailedFolderSetting),
            };
        });

        const folders = this.folders!;

        for (const folder of Object.values(folders)) {
            await fs.mkdir(folder, { recursive: true });
        }

        this.logger.log(`Watching ${folders.import} for imports`);

        this.watcher = watch('.', {
            awaitWriteFinish: true,
            cwd: folders.import,
            alwaysStat: true,
        });
        // onFileAdded handles its own errors, but attach a catch as a last line of defence:
        // an unhandled rejection escaping this fire-and-forget handler would otherwise crash the process.
        this.watcher.on('add', (filePath) => {
            void this.onFileAdded(filePath).catch((error) => {
                this.logger.error(`Unexpected error handling added file ${filePath}`, error);
            });
        });

        // Not awaited: re-importing files needs the pipeline modules, which register in a later bootstrap hook.
        void this.reconcileProcessingFolder().catch((error) => {
            this.logger.error(`Couldn't reconcile the processing folder ${folders.processing}`, error);
        });

        this.checkTimer = setInterval(() => void this.checkProcessingFiles(), CHECK_INTERVAL_MS);
        this.checkTimer.unref();
    }

    public async onApplicationShutdown(): Promise<void> {
        clearInterval(this.checkTimer);
        await this.watcher?.close();
    }

    /**
     * Moves every processing file whose executions all ended to the finished or failed folder. Runs periodically;
     * overlapping calls share one run.
     */
    public checkProcessingFiles(): Promise<void> {
        this.checking ??= this.doCheckProcessingFiles().finally(() => {
            this.checking = undefined;
        });

        return this.checking;
    }

    private async onFileAdded(filePath: string): Promise<void> {
        const folders = this.folders!;
        const absolutePath = join(folders.import, filePath);

        if (this.fileImportService.isIgnored(filePath)) {
            this.logger.log(`Ignoring ${filePath} (media or system file)`);
            await this.move(absolutePath, join(folders.failed, filePath), filePath);

            return;
        }

        if (!(await this.move(absolutePath, join(folders.processing, filePath), filePath))) {
            return;
        }

        await this.importProcessingFile(filePath);
    }

    /** Imports a file that already sits in the processing folder. */
    private async importProcessingFile(filePath: string): Promise<void> {
        const folders = this.folders!;
        const result = await this.fileImportService.importFile({
            absolutePath: join(folders.processing, filePath),
            relativePath: filePath,
        });

        if (result.outcome === 'started') {
            this.processingFiles.set(filePath, {
                executionIds: result.executions.flatMap((execution) =>
                    execution.executionId !== undefined ? [execution.executionId] : [],
                ),
                hadCreationFailure: result.executions.some((execution) => execution.status === 'failed'),
            });

            return;
        }

        if (result.outcome === 'skipped') {
            // A duplicate import is a normal outcome, not a failure: report it at info level and treat the file as
            // finished so it does not pile up in the failed folder on every repeated drop.
            this.logger.log(
                this.buildSkippedImportMessage(
                    filePath,
                    result.triggerResults.filter((r): r is SkippedPipelineTriggerResult => r.status === 'skipped'),
                ),
            );
            await this.moveOutOfProcessing(filePath, 'finished');

            return;
        }

        const reasons = result.executions
            .filter((execution) => execution.reason)
            .map((execution) => `"${execution.blueprintTitle}": ${execution.reason}`)
            .join('; ');
        this.logger.error(
            `Couldn't start a pipeline for imported file ${filePath}: ${result.message || reasons || result.outcome}`,
        );
        await this.moveOutOfProcessing(filePath, 'failed');
    }

    private async doCheckProcessingFiles(): Promise<void> {
        if (!this.processingFiles.size) {
            return;
        }

        const executionIds = [...this.processingFiles.values()].flatMap((file) => file.executionIds);
        let statusById: Map<number, PipelineExecutionStatusEnum>;

        try {
            const executions = await this.em
                .fork()
                .find(PipelineExecutionEntity, { id: { $in: executionIds } }, { fields: ['id', 'executionStatus'] });
            statusById = new Map(executions.map((execution) => [execution.id, execution.executionStatus]));
        } catch (error) {
            this.logger.warn('Could not check the executions of files being imported', error);

            return;
        }

        for (const [filePath, file] of [...this.processingFiles]) {
            // A missing execution (deleted with its blueprint) can never succeed.
            const statuses = file.executionIds.map((id) => statusById.get(id));

            if (statuses.includes(PipelineExecutionStatusEnum.WAITING)) {
                continue;
            }

            const succeeded =
                !file.hadCreationFailure && statuses.every((status) => status === PipelineExecutionStatusEnum.SUCCESS);

            this.processingFiles.delete(filePath);

            if (succeeded) {
                this.logger.log(`Import of ${filePath} finished`);
            } else {
                this.logger.error(
                    `Import of ${filePath} failed (executions ${file.executionIds.join(', ')}: ${statuses.join(', ')})`,
                );
            }

            await this.moveOutOfProcessing(filePath, succeeded ? 'finished' : 'failed');
        }
    }

    /**
     * Picks up files left in the processing folder by a previous run. A file whose content already has a trigger
     * asset with executions is tracked again (latest execution per blueprint); a file without any never got its
     * executions committed, so it is imported again.
     */
    private async reconcileProcessingFolder(): Promise<void> {
        const folders = this.folders!;
        const entries = await fs.readdir(folders.processing, { recursive: true, withFileTypes: true });
        const filePaths = entries
            .filter((entry) => entry.isFile())
            .map((entry) => relative(folders.processing, join(entry.parentPath, entry.name)));

        if (filePaths.length) {
            this.logger.log(`Reconciling ${filePaths.length} file(s) left in ${folders.processing}`);
        }

        for (const filePath of filePaths) {
            try {
                const executionIds = await this.findExecutionsForFile(join(folders.processing, filePath));

                if (executionIds.length) {
                    this.processingFiles.set(filePath, { executionIds, hadCreationFailure: false });
                } else {
                    await this.importProcessingFile(filePath);
                }
            } catch (error) {
                this.logger.error(`Couldn't reconcile ${filePath} in the processing folder`, error);
            }
        }

        await this.checkProcessingFiles();
    }

    private async findExecutionsForFile(absolutePath: string): Promise<number[]> {
        const em = this.em.fork();
        const asset = await this.assetService.findByContent(
            em,
            AssetTypeEnum.PIPELINE,
            await fs.readFile(absolutePath),
        );

        if (!asset) {
            return [];
        }

        const executions = await em.find(
            PipelineExecutionEntity,
            { triggerAsset: asset.id, dryRun: false },
            { fields: ['id', 'blueprint'], orderBy: { id: 'desc' } },
        );
        const latestPerBlueprint = new Map<number, number>();

        for (const execution of executions) {
            if (!latestPerBlueprint.has(execution.blueprint.id)) {
                latestPerBlueprint.set(execution.blueprint.id, execution.id);
            }
        }

        return [...latestPerBlueprint.values()];
    }

    private async moveOutOfProcessing(filePath: string, target: 'finished' | 'failed'): Promise<void> {
        const folders = this.folders!;

        await this.move(join(folders.processing, filePath), join(folders[target], filePath), filePath);
    }

    private async move(from: string, to: string, filePath: string): Promise<boolean> {
        try {
            await moveFile(from, to);

            return true;
        } catch (error) {
            this.logger.error(`Couldn't move imported file ${filePath} to ${to}`, error);

            return false;
        }
    }

    /**
     * Explains that an imported file was intentionally not reprocessed because its exact content already ran
     * through the matching blueprint(s).
     */
    private buildSkippedImportMessage(filePath: string, skippedPipelines: SkippedPipelineTriggerResult[]): string {
        const details = skippedPipelines
            .map((skipped) => `blueprint "${skipped.blueprintTitle}" (${skipped.blueprintId}): ${skipped.reason}`)
            .join('; ');

        return (
            `Imported file "${filePath}" was skipped as a duplicate import - ${details}. ` +
            `Set "allowReimport" on the local-file-trigger node to force a re-run.`
        );
    }
}
