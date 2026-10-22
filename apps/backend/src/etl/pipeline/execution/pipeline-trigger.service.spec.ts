import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@suites/unit';
import type { Mocked } from '@suites/doubles.vitest';
import type { EntityManager } from '@mikro-orm/postgresql';
import { DateTime } from 'luxon';
import { PipelineTriggerService } from './pipeline-trigger.service.js';
import { PipelineExecutionService } from './pipeline-execution.service.js';
import { PipelineExecutionEntity } from '../entity/pipeline-execution.entity.js';
import { PipelineExecutionStatusEnum } from '../type/pipeline-execution-status.enum.js';
import { AbstractTriggerPipelineModule } from '../pipeline-module/abstract-trigger-pipeline.module.js';

const TRIGGER_ASSET_ID = '018f0000-0000-7000-8000-000000000001';

interface TestTriggerInput {
    allowReimport?: boolean;
}

interface TestTriggerOutput {
    fileAsset: { id: string };
}

class TestTriggerPipelineModule extends AbstractTriggerPipelineModule<TestTriggerInput, TestTriggerOutput> {}

/** Minimal stand-in for an execution row - only the fields the guard actually reads. */
function existingExecution(
    id: number,
    executionStatus: PipelineExecutionStatusEnum,
    createdAt = DateTime.fromISO('2026-01-01T10:00:00.000Z', { zone: 'utc' }),
    errorRetryCount = 0,
): PipelineExecutionEntity {
    return { id, executionStatus, createdAt, errorRetryCount } as unknown as PipelineExecutionEntity;
}

describe('PipelineTriggerService', () => {
    let service: PipelineTriggerService;
    let executionService: Mocked<PipelineExecutionService>;
    let em: { find: ReturnType<typeof vi.fn> };

    const buildNodeData = vi.fn(() => ({ fileAsset: { id: TRIGGER_ASSET_ID } }));

    function triggerOptions(overrides: Record<string, unknown> = {}) {
        return {
            buildNodeData,
            resolveTriggerAsset: (output: TestTriggerOutput) => output.fileAsset.id,
            ...overrides,
        };
    }

    function execute(options: Record<string, unknown> = {}) {
        return service.createExecutionsFromTrigger<TestTriggerInput, TestTriggerOutput>(
            em as unknown as EntityManager,
            TestTriggerPipelineModule,
            triggerOptions(options) as never,
        );
    }

    beforeEach(async () => {
        const { unit, unitRef } = await TestBed.solitary(PipelineTriggerService).compile();

        service = unit;
        executionService = unitRef.get(PipelineExecutionService) as unknown as Mocked<PipelineExecutionService>;

        em = { find: vi.fn().mockResolvedValue([]) };
        buildNodeData.mockClear();

        // The node matching itself is covered by the blueprint tests; the guard only cares about the resolved context.
        vi.spyOn(service, 'findMatchingTriggerNodes').mockResolvedValue([
            {
                blueprintEntity: { id: 7, title: 'Import calendar' },
                blueprint: {},
                node: { id: 3, constantInputData: {} },
            },
        ] as never);

        // `void` because the suites mock signature makes eslint treat the fluent return value as a promise.
        void executionService.createExecutionFromTrigger.mockResolvedValue({
            id: 100,
        } as unknown as PipelineExecutionEntity);
    });

    it('creates an execution for a trigger asset that was never imported', async () => {
        const results = await execute();

        expect(results).toEqual([
            {
                status: 'created',
                blueprintId: 7,
                blueprintTitle: 'Import calendar',
                nodeId: 3,
                execution: { id: 100 },
            },
        ]);
        expect(executionService.createExecutionFromTrigger).toHaveBeenCalledWith(
            em,
            7,
            3,
            { fileAsset: { id: TRIGGER_ASSET_ID } },
            { triggerAssetId: TRIGGER_ASSET_ID, dryRun: false },
        );
        expect(service.findMatchingTriggerNodes).toHaveBeenCalledOnce();
    });

    it('only considers successful and in-flight executions as duplicates', async () => {
        await execute();

        expect(em.find).toHaveBeenCalledWith(
            PipelineExecutionEntity,
            {
                blueprint: 7,
                triggerAsset: TRIGGER_ASSET_ID,
                dryRun: false,
                executionStatus: {
                    $in: [PipelineExecutionStatusEnum.SUCCESS, PipelineExecutionStatusEnum.WAITING],
                },
            },
            { orderBy: { id: 'desc' } },
        );
    });

    it('skips a re-import of an asset that already ran through the blueprint successfully', async () => {
        em.find.mockResolvedValue([existingExecution(42, PipelineExecutionStatusEnum.SUCCESS)]);

        const results = await execute();

        expect(results).toEqual([
            {
                status: 'skipped',
                blueprintId: 7,
                blueprintTitle: 'Import calendar',
                nodeId: 3,
                existingExecutionId: 42,
                existingExecutionStatus: PipelineExecutionStatusEnum.SUCCESS,
                reason: 'already imported by execution 42 at 2026-01-01T10:00:00.000Z',
            },
        ]);
        expect(executionService.createExecutionFromTrigger).not.toHaveBeenCalled();
    });

    it('skips a re-import while an execution for the same asset is still running', async () => {
        em.find.mockResolvedValue([existingExecution(43, PipelineExecutionStatusEnum.WAITING)]);

        const results = await execute();

        expect(results[0]).toMatchObject({
            status: 'skipped',
            existingExecutionId: 43,
            existingExecutionStatus: PipelineExecutionStatusEnum.WAITING,
            reason: 'already running as execution 43',
        });
    });

    it('prefers a successful execution over an in-flight one when reporting the duplicate', async () => {
        em.find.mockResolvedValue([
            existingExecution(43, PipelineExecutionStatusEnum.WAITING),
            existingExecution(42, PipelineExecutionStatusEnum.SUCCESS),
        ]);

        const results = await execute();

        expect(results[0]).toMatchObject({ status: 'skipped', existingExecutionId: 42 });
    });

    it('creates a new execution when the only waiting execution is held after an error', async () => {
        em.find.mockResolvedValue([existingExecution(44, PipelineExecutionStatusEnum.WAITING, undefined, 1)]);

        const results = await execute();

        expect(results[0]).toMatchObject({ status: 'created' });
        expect(executionService.createExecutionFromTrigger).toHaveBeenCalledOnce();
    });

    it('creates a new execution when only failed or aborted executions exist', async () => {
        // Failed/aborted rows are filtered out by the query, so the guard sees nothing to skip.
        em.find.mockResolvedValue([]);

        const results = await execute();

        expect(results[0]).toMatchObject({ status: 'created' });
        expect(executionService.createExecutionFromTrigger).toHaveBeenCalledOnce();
    });

    it('bypasses the guard when allowReimport is set for the blueprint', async () => {
        em.find.mockResolvedValue([existingExecution(42, PipelineExecutionStatusEnum.SUCCESS)]);

        const results = await execute({ allowReimport: () => true });

        expect(em.find).not.toHaveBeenCalled();
        expect(results[0]).toMatchObject({ status: 'created' });
    });

    it('bypasses the guard when a programmatic caller passes allowReimport: true', async () => {
        em.find.mockResolvedValue([existingExecution(42, PipelineExecutionStatusEnum.SUCCESS)]);

        const results = await execute({ allowReimport: true });

        expect(results[0]).toMatchObject({ status: 'created' });
    });

    it('never guards when the trigger produces no asset', async () => {
        const results = await execute({ resolveTriggerAsset: () => undefined });

        expect(em.find).not.toHaveBeenCalled();
        expect(results[0]).toMatchObject({ status: 'created' });
    });

    it('reports a failing execution as a failed result instead of throwing', async () => {
        const error = new Error('boom');
        void executionService.createExecutionFromTrigger.mockRejectedValue(error);

        const results = await execute();

        expect(results).toEqual([
            {
                status: 'failed',
                blueprintId: 7,
                blueprintTitle: 'Import calendar',
                nodeId: 3,
                error,
            },
        ]);
    });

    it('does not queue the execution while the creating transaction is still open', async () => {
        await execute();

        expect(executionService.schedulePipelineExecution).not.toHaveBeenCalled();
    });

    it('queues only the created executions once the caller committed', async () => {
        await service.scheduleCreatedExecutions([
            { status: 'created', blueprintId: 7, blueprintTitle: 'A', nodeId: 3, execution: { id: 100 } as never },
            {
                status: 'skipped',
                blueprintId: 8,
                blueprintTitle: 'B',
                nodeId: 3,
                reason: 'already imported',
                existingExecutionId: 42,
                existingExecutionStatus: PipelineExecutionStatusEnum.SUCCESS,
            },
            { status: 'failed', blueprintId: 9, blueprintTitle: 'C', nodeId: 3, error: new Error('boom') },
        ]);

        expect(executionService.schedulePipelineExecution).toHaveBeenCalledExactlyOnceWith(100);
    });
});
