import { Injectable, Logger } from '@nestjs/common';
import type { EntityManager } from '@mikro-orm/postgresql';
import type { Constructable } from '../../../util/type/constructable.interface.js';
import type { BlueprintNodeDto } from '../blueprint/dto/blueprint-node.dto.js';
import type { AbstractTriggerPipelineModule } from '../pipeline-module/abstract-trigger-pipeline.module.js';
import { Reflector } from '@nestjs/core';
import { PipelineBlueprintEntity } from '../blueprint/entity/pipeline-blueprint.entity.js';
import {
    PIPELINE_MODULE_METADATA,
    type PipelineModuleOptions,
} from '../pipeline-module/decorator/pipeline-module.decorator.js';
import { PipelineModuleService } from '../pipeline-module/pipeline-module.service.js';
import { Blueprint } from '../blueprint/util/blueprint.class.js';
import { PipelineExecutionService } from './pipeline-execution.service.js';
import { PipelineExecutionEntity } from '../entity/pipeline-execution.entity.js';
import { PipelineExecutionStatusEnum } from '../type/pipeline-execution-status.enum.js';
import type { PipelineTriggerResult } from './pipeline-trigger-result.type.js';

type PipelineTriggerContext<Input> = {
    blueprintEntity: PipelineBlueprintEntity;
    blueprint: Blueprint;
    node: BlueprintNodeDto<Input>;
};

@Injectable()
export class PipelineTriggerService {
    private readonly logger = new Logger(PipelineTriggerService.name);

    constructor(
        private readonly reflector: Reflector,
        private readonly pipelineModuleService: PipelineModuleService,
        private readonly pipelineExecutionService: PipelineExecutionService,
    ) {}

    public async findMatchingTriggerNodes<Input, Output>(
        em: EntityManager,
        triggerModuleClass: Constructable<AbstractTriggerPipelineModule<Input, Output>>,
        options?: {
            matchNode?: (context: PipelineTriggerContext<Input>) => boolean | Promise<boolean>;
        },
    ): Promise<PipelineTriggerContext<Input>[]> {
        const pipelineModuleOptions = this.reflector.get<PipelineModuleOptions<Input, Output>>(
            PIPELINE_MODULE_METADATA,
            triggerModuleClass,
        );

        const { moduleIdentifier } = this.pipelineModuleService.extractModuleDetails(
            triggerModuleClass,
            Object.create(triggerModuleClass.prototype),
            pipelineModuleOptions,
        );

        const blueprintsWithTrigger = await em.find(PipelineBlueprintEntity, {
            usedModules: {
                id: moduleIdentifier,
            },
        });

        const results = await Promise.all(
            blueprintsWithTrigger.map(async (blueprintEntity) => {
                const blueprint = new Blueprint(blueprintEntity.data);
                const node = blueprint.getNode<Input>(moduleIdentifier);

                if (!node) {
                    throw new Error(
                        `Blueprint ${blueprintEntity.title} is missing the trigger node with id ${moduleIdentifier} but the earlier sql query should have filtered for it`,
                    );
                }

                const doesNodeMatch = options?.matchNode
                    ? await options.matchNode({ blueprintEntity, blueprint, node })
                    : true;

                if (!doesNodeMatch) {
                    return undefined;
                }

                return {
                    blueprintEntity,
                    blueprint,
                    node,
                } satisfies PipelineTriggerContext<Input>;
            }),
        );

        return results.filter(Boolean);
    }

    /**
     * Creates an execution for every blueprint whose trigger node matches. The executions are not queued yet: call
     * {@link scheduleCreatedExecutions} with the results once the surrounding transaction has committed.
     */
    public async createExecutionsFromTrigger<Input, Output>(
        em: EntityManager,
        triggerModuleClass: Constructable<AbstractTriggerPipelineModule<Input, Output>>,
        {
            matchNode,
            buildNodeData,
            resolveTriggerAsset,
            allowReimport,
            dryRun = false,
        }: {
            matchNode?: (context: PipelineTriggerContext<Input>) => boolean | Promise<boolean>;
            buildNodeData: (context: PipelineTriggerContext<Input>) => Output | Promise<Output>;
            /**
             * Returns the id of the asset the trigger data was derived from, enabling the re-import guard: an asset
             * that already ran through this blueprint successfully (or is running right now) is skipped instead of
             * reprocessed. Return undefined to always create a new execution.
             */
            resolveTriggerAsset?: (output: Output, context: PipelineTriggerContext<Input>) => string | undefined;
            /**
             * Bypasses the re-import guard. Either a flat flag for programmatic callers or a per-blueprint predicate,
             * so a trigger module can expose the option in its own node configuration.
             */
            allowReimport?: boolean | ((context: PipelineTriggerContext<Input>) => boolean);
            /** Create dry-run executions: every module runs, nothing is written. Never blocked by the re-import guard. */
            dryRun?: boolean;
        },
    ): Promise<PipelineTriggerResult[]> {
        const triggerContexts = await this.findMatchingTriggerNodes(em, triggerModuleClass, {
            matchNode,
        });

        const settledResults = await Promise.allSettled(
            triggerContexts.map(async (triggerContext): Promise<PipelineTriggerResult> => {
                const { blueprintEntity, node } = triggerContext;
                const outputData = await buildNodeData(triggerContext);
                const triggerAssetId = resolveTriggerAsset?.(outputData, triggerContext);
                const reimportAllowed =
                    typeof allowReimport === 'function' ? allowReimport(triggerContext) : allowReimport === true;

                if (triggerAssetId && !reimportAllowed && !dryRun) {
                    const duplicate = await this.findDuplicateExecution(em, blueprintEntity.id, triggerAssetId);

                    if (duplicate) {
                        return {
                            status: 'skipped',
                            blueprintId: blueprintEntity.id,
                            blueprintTitle: blueprintEntity.title,
                            nodeId: node.id,
                            existingExecutionId: duplicate.id,
                            existingExecutionStatus: duplicate.executionStatus as
                                | PipelineExecutionStatusEnum.SUCCESS
                                | PipelineExecutionStatusEnum.WAITING,
                            reason:
                                duplicate.executionStatus === PipelineExecutionStatusEnum.SUCCESS
                                    ? `already imported by execution ${duplicate.id} at ${duplicate.createdAt.toISO()}`
                                    : `already running as execution ${duplicate.id}`,
                        };
                    }
                }

                const execution = await this.pipelineExecutionService.createExecutionFromTrigger(
                    em,
                    blueprintEntity.id,
                    node.id,
                    outputData,
                    { triggerAssetId, dryRun },
                );

                return {
                    status: 'created',
                    blueprintId: blueprintEntity.id,
                    blueprintTitle: blueprintEntity.title,
                    nodeId: node.id,
                    execution,
                };
            }),
        );

        return settledResults.map((settledResult, index): PipelineTriggerResult => {
            const { blueprintEntity, node } = triggerContexts[index]!;

            if (settledResult.status === 'rejected') {
                this.logger.error('Failed to execute pipeline from trigger', {
                    error: settledResult.reason,
                });

                return {
                    status: 'failed',
                    blueprintId: blueprintEntity.id,
                    blueprintTitle: blueprintEntity.title,
                    nodeId: node.id,
                    error: settledResult.reason,
                };
            }

            const result = settledResult.value;

            if (result.status === 'created') {
                this.logger.debug('Created pipeline execution from trigger', {
                    pipelineExecutionId: result.execution.id,
                });
            } else if (result.status === 'skipped') {
                this.logger.log(
                    `Skipped pipeline execution for blueprint "${result.blueprintTitle}" (${result.blueprintId}): ${result.reason}`,
                );
            }

            return result;
        });
    }

    /** Queues the executions created by {@link createExecutionsFromTrigger}. Call after the transaction committed. */
    public async scheduleCreatedExecutions(results: PipelineTriggerResult[]): Promise<void> {
        for (const result of results) {
            if (result.status === 'created') {
                await this.pipelineExecutionService.schedulePipelineExecution(result.execution.id);
            }
        }
    }

    /**
     * Finds an execution of the same blueprint that already handled the same trigger asset. A successful one wins
     * over an in-flight one so the reported reason is the most meaningful. Failed and aborted executions are ignored
     * on purpose: their work never completed, so the file has to run again.
     */
    private async findDuplicateExecution(
        em: EntityManager,
        blueprintId: number,
        triggerAssetId: string,
    ): Promise<PipelineExecutionEntity | undefined> {
        const existingExecutions = await em.find(
            PipelineExecutionEntity,
            {
                blueprint: blueprintId,
                triggerAsset: triggerAssetId,
                dryRun: false,
                executionStatus: {
                    $in: [PipelineExecutionStatusEnum.SUCCESS, PipelineExecutionStatusEnum.WAITING],
                },
            },
            {
                orderBy: { id: 'desc' },
            },
        );

        // A "waiting" execution whose module hit an unexpected error keeps that status until it is retried by hand
        // (it only flips to "failed" after several retries), so it must not block a re-import forever. Only an
        // execution that never errored counts as in flight.
        const blockingExecutions = existingExecutions.filter(
            (execution) =>
                execution.executionStatus === PipelineExecutionStatusEnum.SUCCESS || execution.errorRetryCount === 0,
        );

        return (
            blockingExecutions.find((execution) => execution.executionStatus === PipelineExecutionStatusEnum.SUCCESS) ??
            blockingExecutions[0]
        );
    }
}
