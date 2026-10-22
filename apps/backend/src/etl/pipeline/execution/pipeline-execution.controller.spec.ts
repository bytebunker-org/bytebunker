import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EntityManager } from '@mikro-orm/postgresql';
import { PipelineExecutionController } from './pipeline-execution.controller.js';
import type { PipelineExecutionService } from './pipeline-execution.service.js';
import type { PipelineProgressService } from '../progress/pipeline-progress.service.js';

describe('PipelineExecutionController', () => {
    let controller: PipelineExecutionController;
    let order: string[];
    let executionService: {
        createExecutionFromTrigger: ReturnType<typeof vi.fn>;
        createRerunFromTrigger: ReturnType<typeof vi.fn>;
        schedulePipelineExecution: ReturnType<typeof vi.fn>;
        resetFromNode: ReturnType<typeof vi.fn>;
        abortExecution: ReturnType<typeof vi.fn>;
    };
    let progressService: { clearNodes: ReturnType<typeof vi.fn> };

    beforeEach(() => {
        order = [];

        const em = {
            transactional: async <T>(callback: (em: EntityManager) => Promise<T>) => {
                const result = await callback({} as EntityManager);
                order.push('commit');

                return result;
            },
        } as unknown as EntityManager;
        const created = (id: number) => () => {
            order.push('create');

            return Promise.resolve({ id });
        };

        executionService = {
            createExecutionFromTrigger: vi.fn(created(11)),
            createRerunFromTrigger: vi.fn(created(12)),
            schedulePipelineExecution: vi.fn((id: number) => {
                order.push(`schedule ${id}`);

                return Promise.resolve();
            }),
            resetFromNode: vi.fn(() => {
                order.push('reset');

                return Promise.resolve([2, 3]);
            }),
            abortExecution: vi.fn(() => {
                order.push('abort');

                return Promise.resolve();
            }),
        };
        progressService = {
            clearNodes: vi.fn(() => {
                order.push('clear progress');

                return Promise.resolve();
            }),
        };

        controller = new PipelineExecutionController(
            em,
            executionService as unknown as PipelineExecutionService,
            progressService as unknown as PipelineProgressService,
        );
    });

    it('queues a new execution only after its transaction committed', async () => {
        const execution = await controller.create({ blueprintId: 1, triggerNodeId: 2, triggerNodeInputData: {} });

        expect(execution).toEqual({ id: 11 });
        expect(order).toEqual(['create', 'commit', 'schedule 11']);
    });

    it.each([
        ['apply', false],
        ['dryRun', true],
    ] as const)('%s queues the re-run only after commit', async (route, dryRun) => {
        await controller[route](5);

        expect(executionService.createRerunFromTrigger).toHaveBeenCalledWith(expect.anything(), 5, { dryRun });
        expect(order).toEqual(['create', 'commit', 'schedule 12']);
    });

    it('retries from a node: resets in a transaction, then clears the live progress and queues the execution', async () => {
        await controller.retryFromNode(5, 2);

        expect(executionService.resetFromNode).toHaveBeenCalledWith(expect.anything(), 5, 2);
        expect(progressService.clearNodes).toHaveBeenCalledWith(5, [2, 3]);
        expect(order).toEqual(['reset', 'commit', 'clear progress', 'schedule 5']);
    });

    it('aborts inside a transaction without scheduling anything', async () => {
        await controller.abort(5);

        expect(executionService.abortExecution).toHaveBeenCalledWith(expect.anything(), 5);
        expect(order).toEqual(['abort', 'commit']);
    });

    it('keeps schedule-execution as "retry all failed"', async () => {
        await controller.scheduleExecution(5);

        expect(executionService.schedulePipelineExecution).toHaveBeenCalledWith(5, true);
    });
});
