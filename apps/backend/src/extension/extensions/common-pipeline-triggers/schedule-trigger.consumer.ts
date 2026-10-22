import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { SCHEDULE_TRIGGER_QUEUE, type ScheduleTriggerJobData } from './schedule-trigger.util.js';
import { ScheduleTriggerService } from './schedule-trigger.service.js';

@Processor(SCHEDULE_TRIGGER_QUEUE)
export class ScheduleTriggerConsumer extends WorkerHost {
    private readonly logger = new Logger(ScheduleTriggerConsumer.name);

    constructor(private readonly scheduleTriggerService: ScheduleTriggerService) {
        super();
    }

    public override async process(job: Job<ScheduleTriggerJobData>): Promise<void> {
        const { blueprintId, nodeId } = job.data;
        const result = await this.scheduleTriggerService.fire(blueprintId, { nodeId });

        if (result.outcome === 'started') {
            this.logger.log(`Schedule started blueprint ${blueprintId}: execution ${result.executionIds.join(', ')}`);
        } else {
            // Skipped and stale (deleted blueprint) ticks are expected; the next sync removes stale schedulers.
            this.logger.log(
                `Schedule of blueprint ${blueprintId} did not start a run (${result.outcome}): ${result.reason}`,
            );
        }
    }
}
