import { Injectable, Logger } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import micromatch from 'micromatch';
import { PipelineTriggerService } from '../../../etl/pipeline/execution/pipeline-trigger.service.js';
import { PipelineModuleService } from '../../../etl/pipeline/pipeline-module/pipeline-module.service.js';
import { AssetService } from '../../../etl/asset/asset.service.js';
import { AssetTypeEnum } from '../../../etl/asset/type/asset-type.enum.js';
import type { Blueprint } from '../../../etl/pipeline/blueprint/util/blueprint.class.js';
import type { BlueprintNodeDto } from '../../../etl/pipeline/blueprint/dto/blueprint-node.dto.js';
import type { PipelineTriggerResult } from '../../../etl/pipeline/execution/pipeline-trigger-result.type.js';
import { buildFileSample, isIgnoredImportPath } from '../../../etl/import/file-sample.util.js';
import { guessKnownFormat } from '../../../etl/import/known-file-formats.constant.js';
import {
    FILE_DETECTION_MIN_CONFIDENCE,
    type FileDetection,
    type FileSample,
} from '../../../etl/import/type/file-detection.interface.js';
import type {
    FileImportExecutionDto,
    FileImportMatchSource,
    FileImportResultDto,
} from '../../../etl/import/dto/file-import-result.dto.js';
import {
    type LocalFileTriggerInput,
    type LocalFileTriggerOutput,
    LocalFileTriggerPipelineModule,
} from './pipeline-module/local-file-trigger.pipeline-module.js';

export interface FileImportRequest {
    absolutePath: string;
    /** Path relative to the import root; globs match against this. */
    relativePath: string;
    dryRun?: boolean;
    /** Re-run even if the same content already went through a blueprint (overrides the per-node option). */
    allowReimport?: boolean;
    /** Only consider these blueprints (e.g. "import with blueprint X" in the UI). */
    blueprintIds?: number[];
}

interface BlueprintMatch {
    blueprintId: number;
    matchedBy: FileImportMatchSource;
    detection?: FileDetection;
}

export interface FileRouting {
    sample: FileSample;
    matches: BlueprintMatch[];
    /** Trigger nodes that were checked, for the "why no pipeline" explanation. */
    considered: { nodeId: number; blueprintTitle: string; globPatterns: string[] }[];
    /** Best guess of the format, also when nothing matched. */
    format?: string;
    confidence?: number;
    unsupportedFormat?: boolean;
}

export interface FileImportOutput extends FileImportResultDto {
    /** Undefined when the file could not even be read. */
    routing?: FileRouting;
    triggerResults: PipelineTriggerResult[];
}

/**
 * Routes one file to the blueprints that import it and starts their executions. Shared by the import folder
 * watcher and the upload endpoint.
 *
 * Routing, per local-file-trigger blueprint:
 * 1. the trigger's glob patterns on the relative path, or its content patterns on the file head;
 * 2. only if no blueprint matched that way: the modules connected to the trigger recognise the file by content
 *    (`detectFile`); the blueprint(s) with the highest confidence win.
 */
@Injectable()
export class FileImportService {
    private readonly logger = new Logger(FileImportService.name);

    constructor(
        private readonly em: EntityManager,
        private readonly pipelineTriggerService: PipelineTriggerService,
        private readonly pipelineModuleService: PipelineModuleService,
        private readonly assetService: AssetService,
    ) {}

    public async route(em: EntityManager, request: FileImportRequest): Promise<FileRouting> {
        // Files dropped while the app boots must not be routed against an empty module registry.
        await this.pipelineModuleService.whenModulesReady();
        const sample = await buildFileSample(request.absolutePath, request.relativePath);
        const triggers = await this.pipelineTriggerService.findMatchingTriggerNodes<
            LocalFileTriggerInput,
            LocalFileTriggerOutput
        >(em, LocalFileTriggerPipelineModule);

        const considered: FileRouting['considered'] = [];
        const ruleMatches: BlueprintMatch[] = [];
        const detections: BlueprintMatch[] = [];

        for (const { blueprintEntity, blueprint, node } of triggers) {
            if (request.blueprintIds && !request.blueprintIds.includes(blueprintEntity.id)) {
                continue;
            }

            const options = node.constantInputData ?? ({} as Partial<LocalFileTriggerInput>);
            const globPatterns = Array.isArray(options.globPatterns) ? options.globPatterns : [];
            considered.push({ nodeId: node.id, blueprintTitle: blueprintEntity.title, globPatterns });

            if (globPatterns.length && micromatch.isMatch(sample.relativePath, globPatterns)) {
                ruleMatches.push({ blueprintId: blueprintEntity.id, matchedBy: 'glob' });
                continue;
            }

            if (this.matchesContentPatterns(sample, options.contentPatterns, blueprintEntity.title)) {
                ruleMatches.push({ blueprintId: blueprintEntity.id, matchedBy: 'content-pattern' });
                continue;
            }

            if (options.detectByContent !== false) {
                const detection = this.detectWithConnectedModules(sample, blueprint, node);

                if (detection) {
                    detections.push({ blueprintId: blueprintEntity.id, matchedBy: 'content-detection', detection });
                }
            }
        }

        const bestDetection = detections.reduce<FileDetection | undefined>(
            (best, match) => (!best || match.detection!.confidence > best.confidence ? match.detection : best),
            undefined,
        );
        const matches = ruleMatches.length
            ? ruleMatches
            : detections.filter((match) => match.detection!.confidence === bestDetection?.confidence);

        // Even for glob matches, report what the file looks like if some importer recognised it.
        const knownFormat = bestDetection ? undefined : guessKnownFormat(sample);

        return {
            sample,
            matches,
            considered,
            format: bestDetection?.format ?? knownFormat,
            confidence: bestDetection?.confidence,
            unsupportedFormat: !matches.length && Boolean(knownFormat),
        };
    }

    public async importFile(request: FileImportRequest): Promise<FileImportOutput> {
        const dryRun = request.dryRun ?? false;

        // The transaction only wraps database work; errors are turned into a result so callers (watcher, upload)
        // can report per file and move on.
        try {
            const output = await this.em.fork().transactional(async (em) => {
                const routing = await this.route(em, request);
                const matchedIds = new Set(routing.matches.map((match) => match.blueprintId));

                if (!matchedIds.size) {
                    return this.buildResult(request, routing, [], dryRun);
                }

                const triggerResults = await this.pipelineTriggerService.createExecutionsFromTrigger<
                    LocalFileTriggerInput,
                    LocalFileTriggerOutput
                >(em, LocalFileTriggerPipelineModule, {
                    matchNode: ({ blueprintEntity }) => matchedIds.has(blueprintEntity.id),
                    buildNodeData: async () => ({
                        // Content-addressed: matching several blueprints stores the file once.
                        fileAsset: await this.assetService.storeAssetFromLocalFile(em, request.absolutePath, {
                            type: AssetTypeEnum.PIPELINE,
                            originalFilePath: routing.sample.relativePath,
                            size: routing.sample.size,
                            metadata: {},
                        }),
                    }),
                    // Links the execution to the imported asset: provenance of the run and the re-import guard.
                    resolveTriggerAsset: (output) => output.fileAsset.id,
                    allowReimport: ({ node }) =>
                        request.allowReimport === true || node.constantInputData?.allowReimport === true,
                    dryRun,
                });

                return this.buildResult(request, routing, triggerResults, dryRun);
            });

            // Queued only now that the executions are committed, so a worker can never miss their rows.
            await this.pipelineTriggerService.scheduleCreatedExecutions(output.triggerResults);

            return output;
        } catch (error) {
            this.logger.error(`Import of ${request.relativePath} failed`, error);

            return {
                relativePath: request.relativePath,
                size: 0,
                outcome: 'failed',
                executions: [],
                message: error instanceof Error ? error.message : String(error),
                triggerResults: [],
            };
        }
    }

    /** Result for files the import skips without looking (media, OS metadata). */
    public ignoredResult(relativePath: string, size: number): FileImportResultDto {
        return {
            relativePath,
            size,
            outcome: 'ignored',
            executions: [],
            message: 'Media or system file, not imported',
        };
    }

    public isIgnored(relativePath: string): boolean {
        return isIgnoredImportPath(relativePath);
    }

    private buildResult(
        request: FileImportRequest,
        routing: FileRouting,
        triggerResults: PipelineTriggerResult[],
        dryRun: boolean,
    ): FileImportOutput {
        const executions: FileImportExecutionDto[] = triggerResults.map((result) => ({
            blueprintId: result.blueprintId,
            blueprintTitle: result.blueprintTitle,
            status: result.status,
            executionId: result.status === 'created' ? result.execution.id : undefined,
            reason:
                result.status === 'skipped'
                    ? result.reason
                    : result.status === 'failed'
                      ? result.error instanceof Error
                          ? result.error.message
                          : String(result.error)
                      : undefined,
        }));
        const created = executions.filter((execution) => execution.status === 'created');
        const skipped = executions.filter((execution) => execution.status === 'skipped');

        const outcome: FileImportResultDto['outcome'] = !routing.matches.length
            ? 'no-match'
            : created.length
              ? dryRun
                  ? 'dry-run'
                  : 'started'
              : skipped.length && skipped.length === executions.length
                ? 'skipped'
                : 'failed';

        return {
            relativePath: routing.sample.relativePath,
            size: routing.sample.size,
            outcome,
            matchedBy: routing.matches[0]?.matchedBy,
            format: routing.format,
            confidence: routing.confidence,
            unsupportedFormat: routing.unsupportedFormat,
            executions,
            message: outcome === 'no-match' ? this.explainNoMatch(routing) : undefined,
            routing,
            triggerResults,
        };
    }

    private explainNoMatch(routing: FileRouting): string {
        if (routing.unsupportedFormat) {
            return `Looks like ${routing.format}; no blueprint imports this format yet.`;
        }

        if (!routing.considered.length) {
            return 'No blueprint has a local-file trigger.';
        }

        const checked = routing.considered
            .map((trigger) => `"${trigger.blueprintTitle}" [${trigger.globPatterns.join(', ')}]`)
            .join('; ');

        return `No blueprint matched by path or content. Checked: ${checked}.`;
    }

    private matchesContentPatterns(sample: FileSample, patterns: unknown, blueprintTitle: string): boolean {
        if (!Array.isArray(patterns)) {
            return false;
        }

        return patterns.some((pattern) => {
            try {
                return new RegExp(String(pattern), 'm').test(sample.head);
            } catch {
                this.logger.warn(`Invalid content pattern ${String(pattern)} in blueprint "${blueprintTitle}"`);

                return false;
            }
        });
    }

    /** Asks the modules directly fed by the trigger whether they can read the file. */
    private detectWithConnectedModules(
        sample: FileSample,
        blueprint: Blueprint,
        triggerNode: Pick<BlueprintNodeDto, 'id'>,
    ): FileDetection | undefined {
        let best: FileDetection | undefined;

        for (const edge of blueprint.getEdges().filter((e) => e.source === triggerNode.id)) {
            const target = blueprint.getNode(edge.target);
            const module = target ? this.pipelineModuleService.getPipelineModule(target.moduleId) : undefined;
            const detection = module?.detectFile?.(sample);

            if (
                detection &&
                detection.confidence >= FILE_DETECTION_MIN_CONFIDENCE &&
                (!best || detection.confidence > best.confidence)
            ) {
                best = detection;
            }
        }

        return best;
    }
}
