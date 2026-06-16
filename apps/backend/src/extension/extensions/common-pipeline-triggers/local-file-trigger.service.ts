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
            const createdPipelines = await this.em.fork().transactional((em) =>
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
                            const fileAsset = await this.assetService.storeAssetFromLocalFile(em, fullRelativeFilePath, {
                                type: AssetTypeEnum.PIPELINE,
                                originalFilePath: filePath,
                                size: stats.size,
                                metadata: {},
                            });

                            // TODO: Add new pipeline id to pipeline asset metadata, maybe do it automatically by scanning output data?
                            return {
                                fileAsset,
                            };
                        },
                    },
                ),
            );

            if (!createdPipelines.length) {
                throw new Error(this.buildNoPipelineError(filePath, consideredTriggers, anyTriggerMatched));
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
     * Builds an actionable error explaining why an imported file produced no pipeline, distinguishing the
     * three possible causes: a blueprint matched but its execution failed, no trigger blueprint was found
     * at all, or blueprints were found but none of their glob patterns matched the file.
     */
    private buildNoPipelineError(
        filePath: string,
        consideredTriggers: { nodeId: number | string; globPatterns: string[] }[],
        anyTriggerMatched: boolean,
    ): string {
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
