import { Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { PipelineTriggerService } from '../../../etl/pipeline/execution/pipeline-trigger.service.js';
import { EntityManager } from '@mikro-orm/postgresql';
import {
    LocalFileTriggerInput,
    LocalFileTriggerOutput,
    LocalFileTriggerPipelineModule,
} from './pipeline-module/local-file-trigger.pipeline-module.js';
import { type FSWatcher, watch } from 'chokidar';
import { SettingService } from '../../../shared/setting/setting.service.js';
import fs from 'node:fs/promises';
import type { Stats } from 'node:fs';
import micromatch from 'micromatch';
import { AssetService } from '../../../etl/asset/asset.service.js';
import { AssetTypeEnum } from '../../../etl/asset/type/asset-type.enum.js';
import { join } from 'node:path';
import { moveFile } from 'move-file';
import type {
    PipelineTriggerResult,
    SkippedPipelineTriggerResult,
} from '../../../etl/pipeline/execution/pipeline-trigger-result.type.js';

@Injectable()
export class LocalFileTriggerService implements OnApplicationBootstrap, OnApplicationShutdown {
    private readonly logger = new Logger(LocalFileTriggerService.name);
    private watcher: FSWatcher | undefined;

    constructor(
        private readonly em: EntityManager,
        private readonly pipelineTriggerService: PipelineTriggerService,
        private readonly settingService: SettingService,
        private readonly assetService: AssetService,
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

            for (const folder of [
                localFileTriggerImportFolderSetting,
                localFileTriggerImportFinishedFolderSetting,
                localFileTriggerImportFailedFolderSetting,
            ]) {
                await fs.mkdir(folder, { recursive: true });

                this.logger.log(`Created folder ${folder} for local file triggers`);
            }

            this.watcher = watch('.', {
                awaitWriteFinish: true,
                cwd: localFileTriggerImportFolderSetting,
                alwaysStat: true,
            });
            // onFileAdded handles its own errors, but attach a catch as a last line of defence:
            // an unhandled rejection escaping this fire-and-forget handler would otherwise crash the process.
            this.watcher.on('add', (filePath, stats) => {
                void this.onFileAdded(filePath, stats!).catch((error) => {
                    this.logger.error(`Unexpected error handling added file ${filePath}`, error);
                });
            });

            /*const pipelineTriggers = await this.pipelineTriggerService.findMatchingTriggerNodes(
                em,
                LocalFileTriggerPipelineModule,
            );

            for (const { node } of pipelineTriggers) {
            }*/
        });
    }

    public async onApplicationShutdown(): Promise<void> {
        await this.watcher?.close();
    }

    private async onFileAdded(filePath: string, stats: Stats): Promise<void> {
        const {
            localFileTriggerImportFolderSetting,
            localFileTriggerImportFinishedFolderSetting,
            localFileTriggerImportFailedFolderSetting,
        } = await this.settingService.getSettingValues(this.em.fork(), [
            'localFileTriggerImportFolder',
            'localFileTriggerImportFinishedFolder',
            'localFileTriggerImportFailedFolder',
        ]);

        const fullRelativeFilePath = join(process.cwd(), localFileTriggerImportFolderSetting, filePath);

        // Diagnostics collected while matching, so a "no pipeline" failure can explain *why*: which trigger
        // glob patterns were checked and whether any actually matched the file.
        const consideredTriggers: { nodeId: number | string; globPatterns: string[] }[] = [];
        let anyTriggerMatched = false;

        // The transaction is scoped to just the database work. Error handling and file moves happen
        // outside of it: once any statement fails, Postgres aborts the whole transaction, so the commit
        // attempt at the end of `transactional` would throw on its own. Catching that here (instead of
        // inside the transaction) keeps a failed import from turning into an unhandled rejection.
        try {
            const triggerResults = await this.em.fork().transactional((em) =>
                this.pipelineTriggerService.executeBlueprintFromTrigger<LocalFileTriggerInput, LocalFileTriggerOutput>(
                    em,
                    LocalFileTriggerPipelineModule,
                    {
                        matchNode: ({ node }) => {
                            const options = node.constantInputData;

                            if (!options?.globPatterns || !Array.isArray(options?.globPatterns)) {
                                throw new Error(
                                    `Invalid glob patterns ${options?.globPatterns} for pipeline trigger node ${node.id}.`,
                                );
                            }

                            if (!options?.globPatterns.length) {
                                return false;
                            }

                            consideredTriggers.push({ nodeId: node.id, globPatterns: options.globPatterns });

                            const matched = micromatch.isMatch(filePath, options.globPatterns);
                            anyTriggerMatched ||= matched;

                            return matched;
                        },
                        buildNodeData: async () => {
                            const fileAsset = await this.assetService.storeAssetFromLocalFile(
                                em,
                                fullRelativeFilePath,
                                {
                                    type: AssetTypeEnum.PIPELINE,
                                    originalFilePath: filePath,
                                    size: stats.size,
                                    metadata: {},
                                },
                            );

                            return {
                                fileAsset,
                            };
                        },
                        // Links the execution back to the imported asset, which both records the provenance of the
                        // run and lets the re-import guard recognise a file whose content was already processed.
                        resolveTriggerAsset: (output) => output.fileAsset.id,
                        allowReimport: ({ node }) => node.constantInputData?.allowReimport === true,
                    },
                ),
            );

            const createdPipelines = triggerResults.filter((result) => result.status === 'created');
            const skippedPipelines = triggerResults.filter((result) => result.status === 'skipped');
            const failedPipelines = triggerResults.filter((result) => result.status === 'failed');

            if (!createdPipelines.length) {
                // A duplicate import is a normal outcome, not a failure: report it at info level and treat the file
                // as finished so it does not pile up in the failed folder on every repeated drop. A failed trigger
                // still wins over a skipped one so the failure is not hidden behind the duplicate notice.
                if (skippedPipelines.length && !failedPipelines.length) {
                    this.logger.log(this.buildSkippedImportMessage(filePath, skippedPipelines));

                    await moveFile(
                        fullRelativeFilePath,
                        join(process.cwd(), localFileTriggerImportFinishedFolderSetting, filePath),
                    );

                    return;
                }

                throw new Error(
                    this.buildNoPipelineError(filePath, consideredTriggers, anyTriggerMatched, triggerResults),
                );
            }

            await moveFile(
                fullRelativeFilePath,
                join(process.cwd(), localFileTriggerImportFinishedFolderSetting, filePath),
            );
        } catch (error) {
            this.logger.error(`Couldn't start pipeline from local file trigger for imported file ${filePath}`, error);

            try {
                await moveFile(
                    fullRelativeFilePath,
                    join(process.cwd(), localFileTriggerImportFailedFolderSetting, filePath),
                );
            } catch (moveError) {
                this.logger.error(`Couldn't move failed import file ${filePath} to failed folder`, moveError);
            }
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

    /**
     * Builds an actionable error explaining why an imported file produced no pipeline, distinguishing the
     * possible causes: a blueprint matched but its execution failed, every match was skipped as a duplicate
     * import, no trigger blueprint was found at all, or blueprints were found but none of their glob patterns
     * matched the file.
     */
    private buildNoPipelineError(
        filePath: string,
        consideredTriggers: { nodeId: number | string; globPatterns: string[] }[],
        anyTriggerMatched: boolean,
        triggerResults: PipelineTriggerResult[] = [],
    ): string {
        const skippedPipelines = triggerResults.filter((result) => result.status === 'skipped');
        const anyTriggerFailed = triggerResults.some((result) => result.status === 'failed');

        if (skippedPipelines.length && !anyTriggerFailed) {
            return this.buildSkippedImportMessage(filePath, skippedPipelines);
        }

        if (anyTriggerMatched) {
            return (
                `Imported file "${filePath}" matched a local-file-trigger blueprint, but no pipeline could be started. ` +
                `See the preceding "Failed to execute pipeline from trigger" error for the underlying cause.`
            );
        }

        if (!consideredTriggers.length) {
            return (
                `Imported file "${filePath}" matched no pipeline: no blueprint uses the local-file-trigger module ` +
                `with configured glob patterns. Create a blueprint with a local-file-trigger node whose globPatterns ` +
                `match this path and re-save it so its used modules are linked.`
            );
        }

        const checked = consideredTriggers
            .map((trigger) => `node ${trigger.nodeId}: [${trigger.globPatterns.join(', ')}]`)
            .join('; ');

        return (
            `Imported file "${filePath}" did not match any local-file-trigger glob pattern. ` +
            `Checked ${consideredTriggers.length} trigger node(s): ${checked}. ` +
            `Adjust a blueprint's globPatterns or the file's path relative to the import folder.`
        );
    }
}
