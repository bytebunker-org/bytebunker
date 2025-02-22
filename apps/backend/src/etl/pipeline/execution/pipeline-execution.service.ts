import { Injectable, Logger } from '@nestjs/common';
import { PipelineBlueprintEntity } from '../blueprint/entity/pipeline-blueprint.entity.js';
import { type EntityManager } from '@mikro-orm/postgresql';
import { Blueprint } from '../blueprint/util/blueprint.class.js';
import { PipelineExecutionEntity } from '../entity/pipeline-execution.entity.js';
import { PipelineExecutionDataEntity } from '../entity/pipeline-execution-data.entity.js';
import { PipelineExecutionStatusEnum } from '../type/pipeline-execution-status.enum.js';
import type { BlueprintNodeDto } from '../blueprint/dto/blueprint-node.dto.js';
import { groupByKeySingle, hasOwn } from '../../../util/util.js';
import type { Collection, Loaded } from '@mikro-orm/core';
import { PipelineModuleService } from '../pipeline-module/pipeline-module.service.js';
import { CreateHoldExecutionDto } from '../dto/create-hold-execution.dto.js';
import { PipelineExecutionLogEntity } from '../entity/pipeline-execution-log.entity.js';
import { InjectFlowProducer, InjectQueue } from '@nestjs/bullmq';
import { QueueFlowNameEnum } from '../../../queue/queue-flow-name.enum.js';
import { FlowProducer, Queue } from 'bullmq';
import { QueueNameEnum } from '../../../queue/queue-name.enum.js';
import type { JobDataType } from '../../../queue/queue-data.type.js';
import { serializeError } from 'serialize-error';
import type { QueueConsumerJob } from '../../../queue/abstract-queue-consumer.class.js';

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
    ) {}

    public async executeBlueprintFromTrigger(
        em: EntityManager,
        blueprintId: number,
        triggerNodeId: number,
        triggerNodeOutputData: unknown,
    ): Promise<PipelineExecutionEntity> {
        const blueprintEntity = await em.findOneOrFail(PipelineBlueprintEntity, { id: blueprintId });
        const blueprint = new Blueprint(blueprintEntity.data);

        const pipelineExecution = em.create(PipelineExecutionEntity, {
            blueprint: blueprintEntity,
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

        this.logger.debug(`Executing pipeline ${pipelineExecution.id} from trigger node ${triggerNodeId}`);

        await this.schedulePipelineExecution(pipelineExecution.id);

        return pipelineExecution;
    }

    public async schedulePipelineExecution(pipelineId: number, forceExecute = false): Promise<void> {
        await this.startPipelineExecutionQueue.add(
            QueueNameEnum.START_PIPELINE_EXECUTION,
            {
                pipelineId,
                forceExecute,
            } satisfies JobDataType<QueueNameEnum.START_PIPELINE_EXECUTION>,
            {
                delay: 500,
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
            if (pipelineExecution.executionStatus === PipelineExecutionStatusEnum.ABORTED) {
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
            pipelineExecution.executionStatus === PipelineExecutionStatusEnum.ABORTED
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
        console.log('executableModuleNodes', executableModuleNodes);

        if (executableModuleNodes.length) {
            this.logger.debug(
                `Scheduling nodes for execution ${executableModuleNodes.map((n) => n.moduleId).join(', ')}`,
            );

            const job = await this.pipelineExecutionFlowProducer.add({
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

            console.log('Flow Job', JSON.stringify(job));

            const flowTree = await this.pipelineExecutionFlowProducer.getFlow({
                id: job.job.id!,
                queueName: QueueNameEnum.CONTINUE_PIPELINE_EXECUTION,
            });
            console.log('created flow, tree:', JSON.stringify(flowTree));
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
            }
        }
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
                data: outputData,
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
        // TODO: Optimize to only load necessary execution data
        const pipelineExecution = await em.findOneOrFail(
            PipelineExecutionEntity,
            {
                id: pipelineId,
            },
            {
                populate: ['blueprint', 'executionData'],
            },
        );
        const blueprint = new Blueprint(pipelineExecution.blueprint.$.data);
        const node = blueprint.getNode(nodeId);

        if (!node) {
            throw new Error(`Pipeline execution ${pipelineExecution.id} node ${nodeId} not found`);
        }

        const inputData = this.buildNodeInputData(pipelineExecution, node);

        try {
            const module = this.moduleService.getPipelineModule(node.moduleId);

            if (!module) {
                throw new Error(
                    `Invalid internal module identifier ${node.moduleId}, available modules: ${this.moduleService
                        .getAllPipelineModuleNames()
                        .join(', ')}`,
                );
            }

            const outputDataOrHoldExecution = await em.fork().transactional((em) =>
                module.executeModule({
                    em,
                    pipelineExecution,
                    blueprint,
                    currentNode: node,
                    inputData,
                }),
            );

            if (outputDataOrHoldExecution instanceof CreateHoldExecutionDto) {
                await this.holdModuleExecution(em, pipelineExecution, node, outputDataOrHoldExecution);
            } else {
                await this.createExecutionData(em, pipelineExecution, node.id, outputDataOrHoldExecution);
            }

            await em.flush();

            this.logger.log(`Executed module ${node.moduleId}, returned ${outputDataOrHoldExecution}`);
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

        if (isUnexpectedError) {
            if (pipelineExecution.errorRetryCount >= 3) {
                pipelineExecution.executionStatus = PipelineExecutionStatusEnum.FAILED;
            }

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

    private buildNodeInputData(
        pipelineExecution: Loaded<PipelineExecutionEntity, 'blueprint' | 'executionData'>,
        node: BlueprintNodeDto,
    ): Record<string, unknown> {
        // TODO Validate inputData via Json Schema

        const blueprint = new Blueprint(pipelineExecution.blueprint.$.data);
        const inputEdges = blueprint.getInputEdgesAtNode(node);

        const inputData: Record<string, unknown> = node.constantInputData
            ? structuredClone(node.constantInputData)
            : {};

        for (const edge of inputEdges) {
            const sourceNodeExecutionData = pipelineExecution.executionData.find((d) => d.nodeId === edge.source);

            if (!sourceNodeExecutionData) {
                throw new Error(
                    `Pipeline execution ${pipelineExecution.id} node ${edge.source} output data is unexpectedly undefined`,
                );
            }

            try {
                // Automatically merge into one array, if multiple connections are connected to the same (array-types) socket
                if (inputData[edge.targetHandle]) {
                    let data = inputData[edge.targetHandle];
                    const additionalData = sourceNodeExecutionData.data?.[edge.sourceHandle];

                    if (!Array.isArray(data)) {
                        data = [data];
                    }

                    if (additionalData !== undefined && additionalData !== null) {
                        (data as unknown[]).push(
                            ...(Array.isArray(additionalData) ? additionalData : [additionalData]),
                        );
                    }

                    inputData[edge.targetHandle] = data;
                } else {
                    inputData[edge.targetHandle] = sourceNodeExecutionData.data?.[edge.sourceHandle];
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
                    'sourceNodeExecutionData:',
                    sourceNodeExecutionData.data,
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
