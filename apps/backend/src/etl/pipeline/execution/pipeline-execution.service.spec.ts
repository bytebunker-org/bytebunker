import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EntityManager } from '@mikro-orm/postgresql';
import type { FlowProducer, Queue } from 'bullmq';
import { PipelineExecutionService } from './pipeline-execution.service.js';
import type { PipelineModuleService } from '../pipeline-module/pipeline-module.service.js';
import type { PipelineProgressService } from '../progress/pipeline-progress.service.js';
import { PipelineModuleTypeEnum } from '../pipeline-module/type/pipeline-module-type.enum.js';
import { PipelineExecutionStatusEnum } from '../type/pipeline-execution-status.enum.js';
import { PipelineExecutionDataEntity } from '../entity/pipeline-execution-data.entity.js';

const TRIGGER = 'test:trigger@1';
const TRANSFORM = 'test:transform@1';

/*
 * 1 (trigger) -> 2 -> 3
 *             -> 4
 */
const BLUEPRINT_DATA = {
    nodes: [
        { id: 1, moduleId: TRIGGER, position: { x: 0, y: 0 } },
        { id: 2, moduleId: TRANSFORM, position: { x: 0, y: 0 } },
        { id: 3, moduleId: TRANSFORM, position: { x: 0, y: 0 } },
        { id: 4, moduleId: TRANSFORM, position: { x: 0, y: 0 } },
    ],
    edges: [
        { id: 0, source: 1, target: 2, sourceHandle: 'out', targetHandle: 'in' },
        { id: 1, source: 2, target: 3, sourceHandle: 'out', targetHandle: 'in' },
        { id: 2, source: 1, target: 4, sourceHandle: 'out', targetHandle: 'in' },
    ],
};

type ExecutionStub = {
    id: number;
    executionStatus: PipelineExecutionStatusEnum;
    errorRetryCount: number;
    dryRun: boolean;
    latestErrorNodeId?: number;
    latestErrorMessage?: string;
    blueprint: { $: { data: typeof BLUEPRINT_DATA } };
    executionData: { nodeId: number; executionStatus: PipelineExecutionStatusEnum; data?: unknown }[] & {
        add: (item: unknown) => void;
    };
    executionLogs: unknown[] & { add: (item: unknown) => void };
};

function collection<T>(items: T[]): T[] & { add: (item: unknown) => void } {
    return Object.assign(items, { add: (item: unknown) => void items.push(item as T) });
}

function executionStub(
    executionStatus: PipelineExecutionStatusEnum,
    nodeStatuses: Record<number, PipelineExecutionStatusEnum> = {},
): ExecutionStub {
    return {
        id: 9,
        executionStatus,
        errorRetryCount: 0,
        dryRun: false,
        blueprint: { $: { data: BLUEPRINT_DATA } },
        executionData: collection(
            Object.entries(nodeStatuses).map(([nodeId, status]) => ({
                nodeId: Number(nodeId),
                executionStatus: status,
                data: { out: 1 },
            })),
        ),
        executionLogs: collection([]),
    };
}

describe('PipelineExecutionService', () => {
    let service: PipelineExecutionService;
    let moduleService: {
        getPipelineModuleOptions: ReturnType<typeof vi.fn>;
        getPipelineModule: ReturnType<typeof vi.fn>;
        whenModulesReady: ReturnType<typeof vi.fn>;
        getAllPipelineModuleNames: ReturnType<typeof vi.fn>;
    };
    let flowProducer: { add: ReturnType<typeof vi.fn> };
    let progressService: { startNode: ReturnType<typeof vi.fn> };
    let execution: ExecutionStub;
    /** Status the committed row has, as seen by a fresh fork. */
    let committedStatus: PipelineExecutionStatusEnum;
    let em: Record<
        'findOne' | 'findOneOrFail' | 'find' | 'nativeDelete' | 'flush' | 'persist' | 'create' | 'upsert' | 'fork',
        ReturnType<typeof vi.fn>
    >;

    beforeEach(() => {
        moduleService = {
            getPipelineModuleOptions: vi.fn((moduleId: string) => ({
                type: moduleId === TRIGGER ? PipelineModuleTypeEnum.TRIGGER : PipelineModuleTypeEnum.NORMAL,
            })),
            getPipelineModule: vi.fn(),
            whenModulesReady: vi.fn(() => Promise.resolve()),
            getAllPipelineModuleNames: vi.fn(() => []),
        };
        flowProducer = { add: vi.fn(() => Promise.resolve()) };
        progressService = {
            startNode: vi.fn(() => Promise.resolve({ finish: vi.fn(() => Promise.resolve()) })),
        };
        service = new PipelineExecutionService(
            moduleService as unknown as PipelineModuleService,
            flowProducer as unknown as FlowProducer,
            {} as Queue,
            { add: vi.fn() } as unknown as Queue,
            progressService as unknown as PipelineProgressService,
        );
        vi.spyOn(service['logger'], 'log').mockImplementation(() => undefined);
        vi.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);

        committedStatus = PipelineExecutionStatusEnum.WAITING;
        em = {
            findOne: vi.fn(() => Promise.resolve(execution)),
            findOneOrFail: vi.fn(() => Promise.resolve(execution)),
            find: vi.fn(() => Promise.resolve(execution.executionData)),
            nativeDelete: vi.fn(() => Promise.resolve(0)),
            flush: vi.fn(() => Promise.resolve()),
            persist: vi.fn(),
            create: vi.fn((_entity: unknown, data: Record<string, unknown>) => data),
            upsert: vi.fn((data: unknown) => Promise.resolve(data)),
            fork: vi.fn(() => ({
                findOne: vi.fn(() => Promise.resolve({ executionStatus: committedStatus })),
                transactional: vi.fn(<T>(callback: (em: EntityManager) => Promise<T>) => callback({} as EntityManager)),
            })),
        };
    });

    const typedEm = () => em as unknown as EntityManager;

    describe('resetFromNode', () => {
        it('deletes the output of the node and everything downstream and puts the execution back to waiting', async () => {
            execution = executionStub(PipelineExecutionStatusEnum.FAILED, {
                1: PipelineExecutionStatusEnum.SUCCESS,
                2: PipelineExecutionStatusEnum.SUCCESS,
                3: PipelineExecutionStatusEnum.FAILED,
                4: PipelineExecutionStatusEnum.SUCCESS,
            });
            execution.latestErrorNodeId = 3;
            execution.latestErrorMessage = 'boom';

            const resetNodeIds = await service.resetFromNode(typedEm(), 9, 2);

            expect(resetNodeIds).toEqual([2, 3]);
            expect(em.nativeDelete).toHaveBeenCalledWith(PipelineExecutionDataEntity, {
                pipelineExecution: 9,
                nodeId: { $in: [2, 3] },
            });
            expect(execution.executionStatus).toBe(PipelineExecutionStatusEnum.WAITING);
            expect(execution.latestErrorNodeId).toBeUndefined();
            expect(execution.latestErrorMessage).toBeUndefined();
            expect(em.flush).toHaveBeenCalled();
        });

        it('keeps the latest error when it belongs to a node outside the retried subtree', async () => {
            execution = executionStub(PipelineExecutionStatusEnum.FAILED);
            execution.latestErrorNodeId = 4;

            await service.resetFromNode(typedEm(), 9, 3);

            expect(execution.latestErrorNodeId).toBe(4);
        });

        it('keeps the trigger output when retrying from the trigger node', async () => {
            execution = executionStub(PipelineExecutionStatusEnum.ABORTED);

            const resetNodeIds = await service.resetFromNode(typedEm(), 9, 1);

            expect(resetNodeIds.sort()).toEqual([2, 3, 4]);
        });

        it('rejects an unknown node', async () => {
            execution = executionStub(PipelineExecutionStatusEnum.FAILED);

            await expect(service.resetFromNode(typedEm(), 9, 99)).rejects.toThrow('has no node 99');
        });
    });

    describe('abortExecution', () => {
        it('marks a running execution aborted', async () => {
            execution = executionStub(PipelineExecutionStatusEnum.WAITING);

            await service.abortExecution(typedEm(), 9);

            expect(execution.executionStatus).toBe(PipelineExecutionStatusEnum.ABORTED);
            expect(em.flush).toHaveBeenCalled();
        });

        it('leaves a finished execution alone', async () => {
            execution = executionStub(PipelineExecutionStatusEnum.SUCCESS);

            await service.abortExecution(typedEm(), 9);

            expect(execution.executionStatus).toBe(PipelineExecutionStatusEnum.SUCCESS);
        });
    });

    describe('continuePipelineExecution', () => {
        it('schedules nothing for an aborted execution', async () => {
            execution = executionStub(PipelineExecutionStatusEnum.ABORTED, { 1: PipelineExecutionStatusEnum.SUCCESS });

            await service.continuePipelineExecution(typedEm(), 9);

            expect(flowProducer.add).not.toHaveBeenCalled();
        });

        it('schedules the nodes that lost their output after a retry', async () => {
            execution = executionStub(PipelineExecutionStatusEnum.WAITING, {
                1: PipelineExecutionStatusEnum.SUCCESS,
                4: PipelineExecutionStatusEnum.SUCCESS,
            });

            await service.continuePipelineExecution(typedEm(), 9);

            const children = (flowProducer.add.mock.calls[0]![0] as { children: { data: { nodeId: number } }[] })
                .children;
            expect(children.map((child) => child.data.nodeId)).toEqual([2]);
        });

        it('marks the execution failed when nothing can run but a node failed', async () => {
            execution = executionStub(PipelineExecutionStatusEnum.WAITING, {
                1: PipelineExecutionStatusEnum.SUCCESS,
                2: PipelineExecutionStatusEnum.SUCCESS,
                3: PipelineExecutionStatusEnum.SUCCESS,
                4: PipelineExecutionStatusEnum.FAILED,
            });

            await service.continuePipelineExecution(typedEm(), 9);

            expect(flowProducer.add).not.toHaveBeenCalled();
            expect(execution.executionStatus).toBe(PipelineExecutionStatusEnum.FAILED);
        });
    });

    describe('executeModule', () => {
        const job = {} as never;

        it('skips a queued module of an aborted execution', async () => {
            execution = executionStub(PipelineExecutionStatusEnum.ABORTED, { 1: PipelineExecutionStatusEnum.SUCCESS });

            await service.executeModule(typedEm(), 9, 2, job);

            expect(moduleService.getPipelineModule).not.toHaveBeenCalled();
            expect(progressService.startNode).not.toHaveBeenCalled();
        });

        it('keeps the execution aborted when a module fails after the abort', async () => {
            execution = executionStub(PipelineExecutionStatusEnum.WAITING, { 1: PipelineExecutionStatusEnum.SUCCESS });
            moduleService.getPipelineModule.mockReturnValue({
                executeModule: () => Promise.reject(new Error('boom')),
            });
            committedStatus = PipelineExecutionStatusEnum.ABORTED;

            const error = await service.executeModule(typedEm(), 9, 2, job);

            expect(error).toBeInstanceOf(Error);
            expect(execution.executionStatus).toBe(PipelineExecutionStatusEnum.ABORTED);
        });

        it('marks the execution failed when a module fails', async () => {
            execution = executionStub(PipelineExecutionStatusEnum.WAITING, { 1: PipelineExecutionStatusEnum.SUCCESS });
            moduleService.getPipelineModule.mockReturnValue({
                executeModule: () => Promise.reject(new Error('boom')),
            });

            await service.executeModule(typedEm(), 9, 2, job);

            expect(execution.executionStatus).toBe(PipelineExecutionStatusEnum.FAILED);
        });
    });
});
