import { Injectable, Logger } from '@nestjs/common';
import type { EntityManager } from '@mikro-orm/postgresql';
import { PipelineTriggerService } from '../../../etl/pipeline/execution/pipeline-trigger.service.js';
import type { PipelineTriggerResult } from '../../../etl/pipeline/execution/pipeline-trigger-result.type.js';
import {
    MyHubSyncTriggerPipelineModule,
    type MyHubSyncTriggerInput,
    type MyHubSyncTriggerOutput,
} from './pipeline-module/my-hub-sync-trigger.pipeline-module.js';

export interface MyHubSyncTriggerResult {
    blueprintId: number;
    blueprintTitle: string;
    status: PipelineTriggerResult['status'];
    executionId?: number;
    error?: string;
}

/**
 * Starts every blueprint that contains the my-hub sync trigger. This is the single entry point for a manual sync
 * (`POST /my-hub/sync`) and the hook a scheduler ("live connectors as triggers") would call on its interval.
 */
@Injectable()
export class MyHubSyncTriggerService {
    private readonly logger = new Logger(MyHubSyncTriggerService.name);

    constructor(private readonly pipelineTriggerService: PipelineTriggerService) {}

    public async trigger(
        em: EntityManager,
        { dryRun = false, now = new Date() }: { dryRun?: boolean; now?: Date } = {},
    ): Promise<MyHubSyncTriggerResult[]> {
        // Executions are created inside the transaction and queued only after it committed.
        const results = await em.transactional((txEm) =>
            this.pipelineTriggerService.createExecutionsFromTrigger<MyHubSyncTriggerInput, MyHubSyncTriggerOutput>(
                txEm,
                MyHubSyncTriggerPipelineModule,
                {
                    buildNodeData: () => ({ triggeredAt: now.toISOString() }),
                    dryRun,
                },
            ),
        );
        await this.pipelineTriggerService.scheduleCreatedExecutions(results);

        this.logger.log(`my-hub sync triggered ${results.length} blueprint(s)${dryRun ? ' (dry run)' : ''}`);

        return results.map((result) => ({
            blueprintId: result.blueprintId,
            blueprintTitle: result.blueprintTitle,
            status: result.status,
            ...(result.status === 'created' ? { executionId: result.execution.id } : {}),
            ...(result.status === 'failed' ? { error: String(result.error) } : {}),
        }));
    }
}
