import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PipelineBlueprintEntity } from '../blueprint/entity/pipeline-blueprint.entity.js';
import { type EntityManager } from '@mikro-orm/postgresql';
import { Blueprint } from '../blueprint/util/blueprint.class.js';
import { PipelineExecutionEntity } from '../entity/pipeline-execution.entity.js';
import { AssetEntity } from '../../asset/entity/asset.entity.js';
import { PipelineExecutionDataEntity } from '../entity/pipeline-execution-data.entity.js';
import { PipelineExecutionStatusEnum } from '../type/pipeline-execution-status.enum.js';
import type { BlueprintNodeDto } from '../blueprint/dto/blueprint-node.dto.js';
import { groupByKeySingle, hasOwn } from '../../../util/util.js';
import type { Collection, Loaded } from '@mikro-orm/core';
import { PipelineModuleService } from '../pipeline-module/pipeline-module.service.js';
import { PipelineModuleTypeEnum } from '../pipeline-module/type/pipeline-module-type.enum.js';
import { CreateHoldExecutionDto } from '../dto/create-hold-execution.dto.js';
import { PipelineExecutionLogEntity } from '../entity/pipeline-execution-log.entity.js';
import { InjectFlowProducer, InjectQueue } from '@nestjs/bullmq';
import { QueueFlowNameEnum } from '../../../queue/queue-flow-name.enum.js';
import { FlowProducer, Queue } from 'bullmq';
import { QueueNameEnum } from '../../../queue/queue-name.enum.js';
import type { JobDataType } from '../../../queue/queue-data.type.js';
import { serializeError } from 'serialize-error';
import type { QueueConsumerJob } from '../../../queue/abstract-queue-consumer.class.js';
import { PipelineProgressService, type ThrottledReporter } from '../progress/pipeline-progress.service.js';
import { PipelineOutputStoreService } from './pipeline-output-store.service.js';

@Injectable()
export class PipelineExecutionService {
    private readonly logger = new Logger(PipelineExecutionService.name);

    constructor(
        private readonly moduleService: PipelineModuleService,
        @InjectFlowProducer(QueueFlowNameEnum.PIPELINE_EXECUTION_FLOW)
        private readonly pipelineExecutionFlowProducer: FlowProducer,
        @InjectQueue(QueueNameEnum.CONTINUE_PIPELINE_EXECUTION)
        private readonly continuePipelineExecutionQueue: Queue,
        @InjectQueue(QueueNameEnum.START_PIPELINE_EXECUTION)
        private readonly startPipelineExecutionQueue: Queue,
        private readonly progressService: PipelineProgressService,
        private readonly outputStore: PipelineOutputStoreService,
    ) {}

    /**
     * Creates an execution from a trigger's output but does not schedule it: the start job must only be queued once
     * the creating transaction has committed, otherwise a worker can pick it up before the rows are visible. Call
     * {@link schedulePipelineExecution} after `transactional` resolves.
     */
    public async createExecutionFromTrigger(
        em: EntityManager,
        blueprintId: number,
        triggerNodeId: number,
        triggerNodeOutputData: unknown,
        options?: {
            /**
             * Id of the asset the trigger data was derived from (e.g. the imported file). Stored on the execution so
             * a later trigger for the very same content can recognise it was already imported.
             */
            triggerAssetId?: string;
            /** Run every module but write nothing (see {@link PipelineExecutionEntity.dryRun}). */
            dryRun?: boolean;
        },
    ): Promise<PipelineExecutionEntity> {
        const blueprintEntity = await em.findOneOrFail(PipelineBlueprintEntity, { id: blueprintId });
        const blueprint = new Blueprint(blueprintEntity.data);

        const pipelineExecution = em.create(PipelineExecutionEntity, {
            blueprint: blueprintEntity,
            triggerAsset: options?.triggerAssetId ? em.getReference(AssetEntity, options.triggerAssetId) : undefined,
            dryRun: options?.dryRun ?? false,
        });

        const initialTriggerNode = blueprint.getNode(triggerNodeId);

        if (!initialTriggerNode) {
            throw new Error(
                `Blueprint ${blueprintEntity.title} doesn't have an the trigger node with id ${triggerNodeId}`,
            );
        }

        pipelineExecution.executionData.add(
            em.create(PipelineExecutionDataEntity, {
                pipelineExecution: pipelineExecution,
                executionStatus: PipelineExecutionStatusEnum.SUCCESS,
                nodeId: initialTriggerNode.id,
                data: triggerNodeOutputData,
            }),
        );

        await em.flush();

        this.logger.debug(`Created pipeline execution ${pipelineExecution.id} from trigger node ${triggerNodeId}`);

        return pipelineExecution;
    }

    /**
     * Starts a new execution of the same blueprint with the same trigger output as an existing one, e.g. to apply a
     * dry run for real, or to preview a re-import. The source execution is left untouched. Like
     * {@link createExecutionFromTrigger}, the caller schedules the new execution after commit.
     */
    public async createRerunFromTrigger(
        em: EntityManager,
        sourceExecutionId: number,
        options: { dryRun: boolean },
    ): Promise<PipelineExecutionEntity> {
        const source = await em.findOneOrFail(
            PipelineExecutionEntity,
            { id: sourceExecutionId },
            { populate: ['blueprint', 'executionData'], exclude: ['executionData.data'] },
        );
        const blueprint = new Blueprint(source.blueprint.$.data);
        const triggerNodeIds = new Set(
            blueprint
                .getNodes()
                .filter(
                    (node) =>
                        this.moduleService.getPipelineModuleOptions(node.moduleId)?.type ===
                        PipelineModuleTypeEnum.TRIGGER,
                )
                .map((node) => node.id),
        );
        const triggerNode = source.executionData.find((d) => triggerNodeIds.has(d.nodeId));

        if (!triggerNode) {
            throw new Error(`Execution ${sourceExecutionId} has no stored trigger output to re-run from`);
        }

        const [triggerData] = await this.loadNodeOutputs(em, sourceExecutionId, [triggerNode.nodeId]);

        return this.createExecutionFromTrigger(em, source.blueprint.id, triggerNode.nodeId, triggerData?.data, {
            triggerAssetId: source.triggerAsset?.id,
            dryRun: options.dryRun,
        });
    }

    /**
     * Queues the start job. Only call this outside of (after) the transaction that created or reset the execution.
     * With `forceExecute`, failed and aborted nodes are reset to waiting first ("retry all failed").
     */
    public async schedulePipelineExecution(pipelineId: number, forceExecute = false): Promise<void> {
        await this.startPipelineExecutionQueue.add(
            QueueNameEnum.START_PIPELINE_EXECUTION,
            {
                pipelineId,
                forceExecute,
            } satisfies JobDataType<QueueNameEnum.START_PIPELINE_EXECUTION>,
            {
                attempts: 1,
            },
        );
    }

    public async continuePipelineExecution(
        em: EntityManager,
        pipelineId: number,
        ignoreStatusNodeIdList: number[] = [],
        executeNodeSubtreeId: number | undefined = undefined,
        forceExecute = false,
    ): Promise<void> {
        const pipelineExecution = await em.findOneOrFail(
            PipelineExecutionEntity,
            {
                id: pipelineId,
            },
            {
                populate: ['blueprint', 'executionData.nodeId', 'executionData.executionStatus'],
            },
        );

        if (forceExecute) {
            if (
                pipelineExecution.executionStatus === PipelineExecutionStatusEnum.ABORTED ||
                pipelineExecution.executionStatus === PipelineExecutionStatusEnum.FAILED
            ) {
                pipelineExecution.executionStatus = PipelineExecutionStatusEnum.WAITING;
                em.persist(pipelineExecution);
            }

            for (const executionData of pipelineExecution.executionData) {
                if (
                    [PipelineExecutionStatusEnum.ABORTED, PipelineExecutionStatusEnum.FAILED].includes(
                        executionData.executionStatus,
                    )
                ) {
                    executionData.executionStatus = PipelineExecutionStatusEnum.WAITING;
                    em.persist(executionData);
                }
            }

            await em.flush();
        }

        if (
            pipelineExecution.executionStatus === PipelineExecutionStatusEnum.SUCCESS ||
            pipelineExecution.executionStatus === PipelineExecutionStatusEnum.ABORTED ||
            pipelineExecution.executionStatus === PipelineExecutionStatusEnum.FAILED
        ) {
            return;
        }

        this.logger.debug(
            `Continuing pipeline execution ${pipelineExecution.id}, status ${pipelineExecution.executionStatus}`,
        );

        const findNextExecutableModules = (): BlueprintNodeDto[] => {
            if (executeNodeSubtreeId === undefined) {
                return this.findExecutableModules(blueprint, pipelineExecution.executionData, ignoreStatusNodeIdList);
            } else {
                return this.findExecutableModulesSubtree(
                    blueprint,
                    pipelineExecution.executionData,
                    executeNodeSubtreeId,
                    ignoreStatusNodeIdList,
                );
            }
        };

        const blueprint = new Blueprint(pipelineExecution.blueprint.$.data);
        const executableModuleNodes = findNextExecutableModules();

        if (executableModuleNodes.length) {
            this.logger.debug(
                `Scheduling nodes for execution ${executableModuleNodes.map((n) => n.moduleId).join(', ')}`,
            );

            await this.pipelineExecutionFlowProducer.add({
                name: QueueFlowNameEnum.PIPELINE_EXECUTION_FLOW,
                queueName: QueueNameEnum.CONTINUE_PIPELINE_EXECUTION,
                data: {
                    pipelineId,
                } satisfies JobDataType<QueueNameEnum.CONTINUE_PIPELINE_EXECUTION>,
                opts: {
                    /*deduplication: {
                        id: `${pipelineId}-${executableModuleNodes
                            .map((n) => n.id)
                            .sort()
                            .join(',')}`,
                    },*/
                    delay: 500,
                    attempts: 1,
                    failParentOnFailure: true,
                },
                children: executableModuleNodes.map((node) => ({
                    queueName: QueueNameEnum.PIPELINE_SINGLE_MODULE_EXECUTION,
                    name: QueueNameEnum.PIPELINE_SINGLE_MODULE_EXECUTION,
                    data: {
                        pipelineId,
                        nodeId: node.id,
                    } satisfies JobDataType<QueueNameEnum.PIPELINE_SINGLE_MODULE_EXECUTION>,
                    opts: {
                        attempts: 1,
                        failParentOnFailure: true,
                    },
                })),
            });
        } else {
            const executionDataList = await em.find(
                PipelineExecutionDataEntity,
                {
                    pipelineExecution,
                },
                { fields: ['executionStatus'] },
            );

            const hasOnlySuccessfulExecutions = !executionDataList.some(
                (d) =>
                    !(
                        d.executionStatus === PipelineExecutionStatusEnum.SUCCESS ||
                        d.executionStatus === PipelineExecutionStatusEnum.BRANCH_IGNORED
                    ),
            );

            if (executionDataList.length === blueprint.getNodes().length && hasOnlySuccessfulExecutions) {
                pipelineExecution.executionStatus = PipelineExecutionStatusEnum.SUCCESS;

                em.persist(pipelineExecution);

                this.logger.debug(`Finished pipeline execution ${pipelineExecution.id}!`);
            } else {
                // Nothing left to run but some node did not succeed, e.g. after retrying one branch while another
                // one stays failed. Without this the execution would stay "waiting" forever.
                const statuses = new Set(executionDataList.map((d) => d.executionStatus));
                const finalStatus = statuses.has(PipelineExecutionStatusEnum.FAILED)
                    ? PipelineExecutionStatusEnum.FAILED
                    : statuses.has(PipelineExecutionStatusEnum.ABORTED)
                      ? PipelineExecutionStatusEnum.ABORTED
                      : undefined;

                if (finalStatus) {
                    pipelineExecution.executionStatus = finalStatus;
                    em.persist(pipelineExecution);
                }
            }
        }
    }

    /**
     * Prepares a retry starting at `nodeId`: the node and everything downstream of it lose their execution data
     * (so they run again with fresh input), and the execution goes back to waiting. Trigger nodes keep their output,
     * it cannot be recomputed. Returns the ids of the reset nodes. Schedule the execution after the transaction
     * committed.
     */
    public async resetFromNode(em: EntityManager, executionId: number, nodeId: number): Promise<number[]> {
        const pipelineExecution = await em.findOne(
            PipelineExecutionEntity,
            { id: executionId },
            { populate: ['blueprint'] },
        );

        if (!pipelineExecution) {
            throw new NotFoundException(`Pipeline execution ${executionId} not found`);
        }

        const blueprint = new Blueprint(pipelineExecution.blueprint.$.data);
        const node = blueprint.getNode(nodeId);

        if (!node) {
            throw new NotFoundException(`Pipeline execution ${executionId} has no node ${nodeId}`);
        }

        const resetNodeIds = [node, ...blueprint.getDependantNodesRecursive(node)]
            .filter(
                (n) => this.moduleService.getPipelineModuleOptions(n.moduleId)?.type !== PipelineModuleTypeEnum.TRIGGER,
            )
            .map((n) => n.id);

        if (resetNodeIds.length) {
            await em.nativeDelete(PipelineExecutionDataEntity, {
                pipelineExecution: executionId,
                nodeId: { $in: resetNodeIds },
            });
        }

        pipelineExecution.executionStatus = PipelineExecutionStatusEnum.WAITING;

        if (
            pipelineExecution.latestErrorNodeId !== undefined &&
            resetNodeIds.includes(pipelineExecution.latestErrorNodeId)
        ) {
            pipelineExecution.latestErrorNodeId = undefined;
            pipelineExecution.latestErrorStatus = undefined;
            pipelineExecution.latestErrorMessage = undefined;
            pipelineExecution.latestErrorData = undefined;
        }

        await em.flush();

        this.logger.log(`Reset nodes ${resetNodeIds.join(', ')} of pipeline execution ${executionId} for a retry`);

        return resetNodeIds;
    }

    /**
     * Stops scheduling further nodes. A module that is running right now finishes and stores its output, but its
     * successors never start; queued modules skip themselves (see {@link executeModule}). Finished executions are
     * left alone.
     */
    public async abortExecution(em: EntityManager, executionId: number): Promise<void> {
        const pipelineExecution = await em.findOne(PipelineExecutionEntity, { id: executionId });

        if (!pipelineExecution) {
            throw new NotFoundException(`Pipeline execution ${executionId} not found`);
        }

        if (pipelineExecution.executionStatus !== PipelineExecutionStatusEnum.WAITING) {
            return;
        }

        pipelineExecution.executionStatus = PipelineExecutionStatusEnum.ABORTED;
        await em.flush();

        this.logger.log(`Aborted pipeline execution ${executionId}`);
    }

    public async createExecutionData(
        em: EntityManager,
        pipelineExecution: PipelineExecutionEntity,
        nodeId: number,
        outputData: unknown | undefined,
        executionStatus = PipelineExecutionStatusEnum.SUCCESS,
    ): Promise<void> {
        const executionData = await em.upsert(
            PipelineExecutionDataEntity,
            em.create(PipelineExecutionDataEntity, {
                pipelineExecution,
                nodeId,
                executionStatus,
                data: (await this.outputStore.externalize(em, pipelineExecution.id, nodeId, outputData)) as
                    | Record<string, unknown>
                    | undefined,
            }),
        );
        pipelineExecution.executionData.add(executionData);

        /*await em
            .createQueryBuilder()
            .insert()
            .into(MWorkspaceExecutionData)
            // @ts-ignore
            .values(executionData)
            .orUpdate({
                overwrite: ['executionStatus', 'data'],
            })
            .execute();*/

        // Latest error is from the same node which now executed successfully, remove the latest error message
        if (pipelineExecution.latestErrorNodeId === nodeId) {
            pipelineExecution.latestErrorNodeId = undefined;
            pipelineExecution.latestErrorStatus = undefined;
            pipelineExecution.latestErrorMessage = undefined;
            pipelineExecution.latestErrorData = undefined;

            em.persist(pipelineExecution);
        }
    }

    public async executeModule(
        em: EntityManager,
        pipelineId: number,
        nodeId: number,
        job: QueueConsumerJob<QueueNameEnum.PIPELINE_SINGLE_MODULE_EXECUTION>,
    ): Promise<Error | void> {
        // Node outputs are not loaded here: only the outputs feeding this node are read, below.
        const pipelineExecution = await em.findOneOrFail(
            PipelineExecutionEntity,
            {
                id: pipelineId,
            },
            {
                populate: ['blueprint', 'executionData'],
                exclude: ['executionData.data'],
            },
        );
        const blueprint = new Blueprint(pipelineExecution.blueprint.$.data);
        const node = blueprint.getNode(nodeId);

        if (!node) {
            throw new Error(`Pipeline execution ${pipelineExecution.id} node ${nodeId} not found`);
        }

        if (pipelineExecution.executionStatus === PipelineExecutionStatusEnum.ABORTED) {
            this.logger.log(`Skipping node ${node.id} of aborted pipeline execution ${pipelineExecution.id}`);

            return;
        }

        const inputData = await this.buildNodeInputData(em, pipelineExecution, node);
        let progress: ThrottledReporter | undefined;

        try {
            await this.moduleService.whenModulesReady();
            const module = this.moduleService.getPipelineModule(node.moduleId);

            if (!module) {
                throw new Error(
                    `Invalid internal module identifier ${node.moduleId}, available modules: ${this.moduleService
                        .getAllPipelineModuleNames()
                        .join(', ')}`,
                );
            }

            progress = await this.progressService.startNode(pipelineExecution.id, node.id, (percent) =>
                job.updateProgress(percent),
            );
            const moduleProgress = progress;

            const outputDataOrHoldExecution = await em.fork().transactional((em) =>
                module.executeModule({
                    em,
                    pipelineExecution,
                    blueprint,
                    currentNode: node,
                    inputData,
                    progress: moduleProgress,
                    dryRun: pipelineExecution.dryRun,
                }),
            );

            if (outputDataOrHoldExecution instanceof CreateHoldExecutionDto) {
                await this.holdModuleExecution(em, pipelineExecution, node, outputDataOrHoldExecution);
            } else {
                await this.createExecutionData(em, pipelineExecution, node.id, outputDataOrHoldExecution);
            }

            await em.flush();
            await progress.finish(outputDataOrHoldExecution instanceof CreateHoldExecutionDto ? 'failed' : 'success');

            this.logger.log(`Executed module ${node.moduleId} in pipeline execution ${pipelineExecution.id}`);
        } catch (error) {
            this.logger.warn(
                `Couldn't execute module ${node.moduleId} in pipeline execution ${pipelineExecution.id} (node ${node.id})`,
                error,
            );

            let statusCode = 500;
            let message: string | undefined = undefined;

            if (error && typeof error === 'object') {
                if (hasOwn(error, 'statusCode') && typeof error.statusCode === 'number') {
                    statusCode = error.statusCode;
                }
                if (hasOwn(error, 'message') && typeof error.message === 'string') {
                    message = error.message;
                }
            }

            await progress?.finish('failed', message ?? 'Unexpected error');

            await this.holdModuleExecution(
                em,
                pipelineExecution,
                node,
                new CreateHoldExecutionDto({
                    isUnexpectedError: true,
                    isAbort: false,
                    executionLog: {
                        statusCode,
                        message,
                        error: error as Error,
                    },
                }),
            );

            await em.flush();

            return error as Error;
        }
    }

    private async holdModuleExecution(
        em: EntityManager,
        pipelineExecution: Loaded<PipelineExecutionEntity, 'blueprint' | 'executionData'>,
        node: BlueprintNodeDto,
        data: CreateHoldExecutionDto,
    ): Promise<void> {
        this.logger.debug(`Holding module execution in pipeline execution ${pipelineExecution.id}`, {
            pipelineExecutionId: pipelineExecution.id,
            moduleId: node.moduleId,
            nodeId: node.id,
            isUnexpectedError: data.isUnexpectedError,
            isAbort: data.isAbort,
            message: data.executionLog?.message ?? '',
        });

        const { isUnexpectedError, isAbort, executionLog: executionLogData } = data;

        const executionLog = em.create(PipelineExecutionLogEntity, {
            pipelineExecution,
            nodeId: node.id,
            message: executionLogData?.message?.slice(0, 255) ?? '',
            data: {
                statusCode: executionLogData?.statusCode ?? 500,
                data: executionLogData?.data,
                error: executionLogData?.error ? serializeError(executionLogData?.error) : undefined,
            },
        });
        em.persist(executionLog);
        pipelineExecution.executionLogs.add(executionLog);

        // The execution may have been aborted while this module ran; that decision wins over the module's outcome.
        const wasAborted = await this.isAborted(em, pipelineExecution.id);

        if (wasAborted) {
            pipelineExecution.executionStatus = PipelineExecutionStatusEnum.ABORTED;
        } else if (isUnexpectedError) {
            // Nothing retries automatically, so an execution left "waiting" here would hang forever. Mark it failed;
            // scheduling it again (force execute) resets it to waiting. errorRetryCount counts the attempts.
            pipelineExecution.executionStatus = PipelineExecutionStatusEnum.FAILED;
            pipelineExecution.errorRetryCount = Math.min(pipelineExecution.errorRetryCount + 1, 100);
        } else if (isAbort) {
            pipelineExecution.executionStatus = PipelineExecutionStatusEnum.ABORTED;
        }

        const executionData = await em.upsert(
            em.create(PipelineExecutionDataEntity, {
                pipelineExecution,
                nodeId: node.id,
                executionStatus: isUnexpectedError
                    ? PipelineExecutionStatusEnum.FAILED
                    : PipelineExecutionStatusEnum.ABORTED,
                data: undefined,
            }),
        );
        pipelineExecution.executionData.add(executionData);

        if (
            executionData.executionStatus === PipelineExecutionStatusEnum.ABORTED ||
            executionData.executionStatus === PipelineExecutionStatusEnum.FAILED
        ) {
            pipelineExecution.latestErrorNodeId = node.id;
            pipelineExecution.latestErrorStatus = executionData.executionStatus;
            pipelineExecution.latestErrorMessage = executionLog.message;
            pipelineExecution.latestErrorData = executionLog.data;
        }

        em.persist(pipelineExecution);
    }

    /** Reads the committed status, not the one loaded when the module started. */
    private async isAborted(em: EntityManager, executionId: number): Promise<boolean> {
        const current = await em
            .fork()
            .findOne(PipelineExecutionEntity, { id: executionId }, { fields: ['executionStatus'] });

        return current?.executionStatus === PipelineExecutionStatusEnum.ABORTED;
    }

    /**
     * Reads the stored outputs of the given nodes with a plain query: no entities, so no ORM snapshot copies of what can
     * be a large JSON value.
     */
    private async loadNodeOutputs(
        em: EntityManager,
        executionId: number,
        nodeIds: number[],
    ): Promise<{ nodeId: number; data: Record<string, unknown> | undefined }[]> {
        if (!nodeIds.length) {
            return [];
        }

        const rows = await em
            .getConnection()
            .execute<
                { node_id: number; data: Record<string, unknown> | null }[]
            >(`SELECT node_id, data FROM pipeline_execution_data_entity WHERE pipeline_execution_id = ? AND node_id IN (${nodeIds.map(() => '?').join(', ')})`, [executionId, ...nodeIds]);

        return rows.map((row) => ({ nodeId: row.node_id, data: row.data ?? undefined }));
    }

    private async buildNodeInputData(
        em: EntityManager,
        pipelineExecution: Loaded<PipelineExecutionEntity, 'blueprint' | 'executionData'>,
        node: BlueprintNodeDto,
    ): Promise<Record<string, unknown>> {
        // TODO Validate inputData via Json Schema

        const blueprint = new Blueprint(pipelineExecution.blueprint.$.data);
        const inputEdges = blueprint.getInputEdgesAtNode(node);
        const outputs = await this.loadNodeOutputs(em, pipelineExecution.id, [
            ...new Set(inputEdges.map((edge) => edge.source)),
        ]);

        const inputData: Record<string, unknown> = node.constantInputData
            ? structuredClone(node.constantInputData)
            : {};

        for (const edge of inputEdges) {
            const sourceNodeExecutionData = outputs.find((d) => d.nodeId === edge.source);

            if (!sourceNodeExecutionData) {
                throw new Error(
                    `Pipeline execution ${pipelineExecution.id} node ${edge.source} output data is unexpectedly undefined`,
                );
            }

            try {
                // Automatically merge into one array, if multiple connections are connected to the same (array-types) socket
                if (inputData[edge.targetHandle]) {
                    let data = inputData[edge.targetHandle];
                    const additionalData = await this.outputStore.resolve(
                        em,
                        sourceNodeExecutionData.data?.[edge.sourceHandle],
                    );

                    if (!Array.isArray(data)) {
                        data = [data];
                    }

                    if (additionalData !== undefined && additionalData !== null) {
                        // A loop, not push(...items): spreading 200k+ items overflows the call stack.
                        for (const item of Array.isArray(additionalData) ? additionalData : [additionalData]) {
                            (data as unknown[]).push(item);
                        }
                    }

                    inputData[edge.targetHandle] = data;
                } else {
                    inputData[edge.targetHandle] = await this.outputStore.resolve(
                        em,
                        sourceNodeExecutionData.data?.[edge.sourceHandle],
                    );
                }
            } catch (error) {
                console.log(
                    "Can't build node input data, node:",
                    {
                        id: node.id,
                        moduleId: node.moduleId,
                        constantInputData: node.constantInputData,
                    },
                    'edge:',
                    {
                        id: edge.id,
                        source: edge.source,
                        sourceHandle: edge.sourceHandle,
                        target: edge.target,
                        targetHandle: edge.targetHandle,
                    },
                    error,
                    'source node:',
                    sourceNodeExecutionData.nodeId,
                );

                throw error;
            }
        }

        return inputData;
    }

    /**
     * Finds all executable nodes in the subtree of a node, which are dependent on this node.
     * Useful to only execute nodes which have just become executable after a specific node has completed.
     *
     * @param blueprintData
     * @param executionData
     * @param subtreeNodeId
     * @param ignoreStatusNodeIdList
     * @private
     */
    private findExecutableModulesSubtree(
        blueprintData: Blueprint,
        executionData: Collection<PipelineExecutionDataEntity>,
        subtreeNodeId: number,
        ignoreStatusNodeIdList: number[] = [],
    ): BlueprintNodeDto[] {
        /*
            First, get all currently executable nodes, then set the execution status of the root node to waiting.
            Then get all executable nodes again, this list now doesn't contain nodes, which depend on the root node.
            Return the difference of both list, so any node, which isn't in the second list, meaning its execution depends on the root node.
         */
        const allExecutableNodes = this.findExecutableModules(blueprintData, executionData, ignoreStatusNodeIdList);

        const rootNodeExecutionData = executionData.find((d) => d.nodeId === subtreeNodeId);

        if (!rootNodeExecutionData) {
            throw new Error("Can't get subtree of not yet executed node");
        }

        const previousStatus = rootNodeExecutionData.executionStatus;
        rootNodeExecutionData.executionStatus = PipelineExecutionStatusEnum.WAITING;

        const previouslyExecutableNodeIds = new Set(
            this.findExecutableModules(blueprintData, executionData, ignoreStatusNodeIdList).map((n) => n.id),
        );

        rootNodeExecutionData.executionStatus = previousStatus;

        return allExecutableNodes.filter((n) => !previouslyExecutableNodeIds.has(n.id) && n.id !== subtreeNodeId);
    }

    private findExecutableModules(
        blueprint: Blueprint,
        executionData: Collection<PipelineExecutionDataEntity>,
        ignoreStatusNodeIdList: number[] = [],
    ): BlueprintNodeDto[] {
        const executableModuleList: BlueprintNodeDto[] = [];
        const executionDataMap: Record<number, PipelineExecutionDataEntity> = groupByKeySingle(executionData, 'nodeId');

        for (const node of blueprint.getNodes()) {
            const executionData = executionDataMap[node.id];

            if (
                !executionData ||
                ignoreStatusNodeIdList.includes(node.id) ||
                executionData.executionStatus === PipelineExecutionStatusEnum.WAITING
            ) {
                const inputEdges = blueprint.getInputEdgesAtNode(node);
                let hasWaitingInputNode = false;

                for (const edge of inputEdges) {
                    const inputNodeExecutionData = executionDataMap[edge.source];

                    if (
                        !inputNodeExecutionData ||
                        inputNodeExecutionData.executionStatus !== PipelineExecutionStatusEnum.SUCCESS
                    ) {
                        hasWaitingInputNode = true;

                        break;
                    }
                }

                if (!hasWaitingInputNode) {
                    executableModuleList.push(node);
                }
            }
        }

        return executableModuleList;
    }
}
