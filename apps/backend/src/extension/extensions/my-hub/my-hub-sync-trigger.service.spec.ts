import { beforeEach, describe, expect, it } from 'vitest';
import { TestBed } from '@suites/unit';
import type { Mocked } from '@suites/doubles.vitest';
import type { EntityManager } from '@mikro-orm/postgresql';
import { MyHubSyncTriggerService } from './my-hub-sync-trigger.service.js';
import { PipelineTriggerService } from '../../../etl/pipeline/execution/pipeline-trigger.service.js';
import { MyHubSyncTriggerPipelineModule } from './pipeline-module/my-hub-sync-trigger.pipeline-module.js';
import type { PipelineExecutionEntity } from '../../../etl/pipeline/entity/pipeline-execution.entity.js';

describe('MyHubSyncTriggerService', () => {
    let service: MyHubSyncTriggerService;
    let pipelineTriggerService: Mocked<PipelineTriggerService>;

    beforeEach(async () => {
        const { unit, unitRef } = await TestBed.solitary(MyHubSyncTriggerService).compile();

        service = unit;
        pipelineTriggerService = unitRef.get(PipelineTriggerService) as unknown as Mocked<PipelineTriggerService>;
    });

    it('starts every blueprint with the sync trigger and summarises the results', async () => {
        void pipelineTriggerService.executeBlueprintFromTrigger.mockResolvedValue([
            {
                status: 'created',
                blueprintId: 1,
                blueprintTitle: 'my-hub persons',
                nodeId: 1,
                execution: { id: 77 } as PipelineExecutionEntity,
            },
            {
                status: 'failed',
                blueprintId: 2,
                blueprintTitle: 'my-hub calendar',
                nodeId: 1,
                error: new Error('boom'),
            },
        ]);
        const em = {} as EntityManager;

        const results = await service.trigger(em, { dryRun: true, now: new Date('2026-10-22T08:00:00Z') });

        const [calledEm, triggerClass, options] = pipelineTriggerService.executeBlueprintFromTrigger.mock.calls[0]!;
        expect(calledEm).toBe(em);
        expect(triggerClass).toBe(MyHubSyncTriggerPipelineModule);
        expect(options.dryRun).toBe(true);
        expect(await options.buildNodeData({} as never)).toEqual({ triggeredAt: '2026-10-22T08:00:00.000Z' });
        expect(results).toEqual([
            { blueprintId: 1, blueprintTitle: 'my-hub persons', status: 'created', executionId: 77 },
            { blueprintId: 2, blueprintTitle: 'my-hub calendar', status: 'failed', error: 'Error: boom' },
        ]);
    });
});
