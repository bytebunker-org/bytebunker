import { Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { type FSWatcher, watch } from 'chokidar';
import { SettingService } from '../../../shared/setting/setting.service.js';
import fs from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { moveFile } from 'move-file';
import type { SkippedPipelineTriggerResult } from '../../../etl/pipeline/execution/pipeline-trigger-result.type.js';
import { FileImportService } from './file-import.service.js';

interface ImportFolders {
    import: string;
    finished: string;
    failed: string;
}

/**
 * Watches the import folder and hands every new file to {@link FileImportService}. A file that started (or was
 * skipped as an already imported duplicate of) a pipeline moves to the finished folder, anything else to the
 * failed folder.
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

    constructor(
        private readonly em: EntityManager,
        private readonly settingService: SettingService,
        private readonly fileImportService: FileImportService,
    ) {}

    public onApplicationBootstrap(): Promise<void> {
        return this.em.transactional(async (em) => {
            const {
                localFileTriggerImportFolderSetting,
                localFileTriggerImportFinishedFolderSetting,
                localFileTriggerImportFailedFolderSetting,
            } = await this.settingService.getSettingValues(em, [
                'localFileTriggerImportFolder',
                'localFileTriggerImportFinishedFolder',
                'localFileTriggerImportFailedFolder',
            ]);

            this.folders = {
                import: resolve(process.cwd(), localFileTriggerImportFolderSetting),
                finished: resolve(process.cwd(), localFileTriggerImportFinishedFolderSetting),
                failed: resolve(process.cwd(), localFileTriggerImportFailedFolderSetting),
            };

            for (const folder of Object.values(this.folders)) {
                await fs.mkdir(folder, { recursive: true });
            }

            this.logger.log(`Watching ${this.folders.import} for imports`);

            this.watcher = watch('.', {
                awaitWriteFinish: true,
                cwd: this.folders.import,
                alwaysStat: true,
            });
            // onFileAdded handles its own errors, but attach a catch as a last line of defence:
            // an unhandled rejection escaping this fire-and-forget handler would otherwise crash the process.
            this.watcher.on('add', (filePath) => {
                void this.onFileAdded(filePath).catch((error) => {
                    this.logger.error(`Unexpected error handling added file ${filePath}`, error);
                });
            });
        });
    }

    public async onApplicationShutdown(): Promise<void> {
        await this.watcher?.close();
    }

    private async onFileAdded(filePath: string): Promise<void> {
        const folders = this.folders!;
        const absolutePath = join(folders.import, filePath);

        if (this.fileImportService.isIgnored(filePath)) {
            this.logger.log(`Ignoring ${filePath} (media or system file)`);
            await this.move(absolutePath, join(folders.failed, filePath), filePath);

            return;
        }

        const result = await this.fileImportService.importFile({ absolutePath, relativePath: filePath });

        if (result.outcome === 'started') {
            await this.move(absolutePath, join(folders.finished, filePath), filePath);

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
            await this.move(absolutePath, join(folders.finished, filePath), filePath);

            return;
        }

        const reasons = result.executions
            .filter((execution) => execution.reason)
            .map((execution) => `"${execution.blueprintTitle}": ${execution.reason}`)
            .join('; ');
        this.logger.error(
            `Couldn't start a pipeline for imported file ${filePath}: ${result.message || reasons || result.outcome}`,
        );
        await this.move(absolutePath, join(folders.failed, filePath), filePath);
    }

    private async move(from: string, to: string, filePath: string): Promise<void> {
        try {
            await moveFile(from, to);
        } catch (error) {
            this.logger.error(`Couldn't move imported file ${filePath} to ${to}`, error);
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
