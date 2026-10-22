import { Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { EntityManager } from '@mikro-orm/postgresql';
import { PipelineTriggerService } from '../../../etl/pipeline/execution/pipeline-trigger.service.js';
import { PipelineModuleService } from '../../../etl/pipeline/pipeline-module/pipeline-module.service.js';
import { PipelineExecutionEntity } from '../../../etl/pipeline/entity/pipeline-execution.entity.js';
import { PipelineExecutionStatusEnum } from '../../../etl/pipeline/type/pipeline-execution-status.enum.js';
import type { PipelineTriggerResult } from '../../../etl/pipeline/execution/pipeline-trigger-result.type.js';
import {
    type ScheduleTriggerInput,
    ScheduleTriggerPipelineModule,
    type ScheduleTriggerOutput,
} from './pipeline-module/schedule-trigger.pipeline-module.js';
import {
    type DesiredSchedule,
    planScheduleSync,
    SCHEDULE_TRIGGER_QUEUE,
    type ScheduleTriggerJobData,
    toDesiredSchedule,
} from './schedule-trigger.util.js';

const SYNC_INTERVAL_MS = 60_000;

export interface ScheduleFireResult {
    outcome: 'started' | 'skipped' | 'not-found' | 'failed';
    executionIds: number[];
    reason?: string;
}

/**
 * Keeps one BullMQ job scheduler per schedule-trigger node and starts the blueprint when it fires. BullMQ hands each
 * tick to exactly one worker, so several backend processes never start the same run twice.
 *
 * Blueprints are re-read every minute (and at boot), which picks up created, edited and deleted blueprints without
 * hooking into the blueprint service.
 */
@Injectable()
export class ScheduleTriggerService implements OnApplicationBootstrap, OnApplicationShutdown {
    private readonly logger = new Logger(ScheduleTriggerService.name);
    private syncTimer: NodeJS.Timeout | undefined;
    private syncing: Promise<void> | undefined;
    /** Invalid schedules already reported, so a broken blueprint does not log an error every minute. */
    private readonly reportedInvalid = new Set<string>();

    constructor(
        private readonly em: EntityManager,
        private readonly pipelineTriggerService: PipelineTriggerService,
        private readonly pipelineModuleService: PipelineModuleService,
        @InjectQueue(SCHEDULE_TRIGGER_QUEUE) private readonly queue: Queue<ScheduleTriggerJobData>,
    ) {}

    public onApplicationBootstrap(): void {
        // Not awaited: the module registry (and thereby the trigger's module id) is only ready after bootstrap.
        void this.syncSchedules();
        this.syncTimer = setInterval(() => void this.syncSchedules(), SYNC_INTERVAL_MS);
        this.syncTimer.unref();
    }

    public onApplicationShutdown(): void {
        clearInterval(this.syncTimer);
    }

    /** Registers, updates and removes job schedulers to match the stored blueprints. Overlapping calls share a run. */
    public syncSchedules(): Promise<void> {
        this.syncing ??= this.doSyncSchedules()
            .catch((error: Error) =>
                this.logger.error(`Syncing schedule triggers failed: ${error.message}`, error.stack),
            )
            .finally(() => {
                this.syncing = undefined;
            });

        return this.syncing;
    }

    /**
     * Starts the blueprint's schedule-trigger node now. Skipped while a previous (non dry-run) execution of the same
     * blueprint is still waiting or running; an execution that hit an error and waits for a manual retry does not
     * block, same as the re-import guard of the file trigger.
     */
    public async fire(
        blueprintId: number,
        options: { nodeId?: number; dryRun?: boolean; firedAt?: Date } = {},
    ): Promise<ScheduleFireResult> {
        await this.pipelineModuleService.whenModulesReady();
        const firedAt = (options.firedAt ?? new Date()).toISOString();

        const outcome = await this.em
            .fork()
            .transactional(async (em): Promise<ScheduleFireResult | PipelineTriggerResult[]> => {
                if (!options.dryRun) {
                    const running = await em.findOne(
                        PipelineExecutionEntity,
                        {
                            blueprint: blueprintId,
                            dryRun: false,
                            executionStatus: PipelineExecutionStatusEnum.WAITING,
                            errorRetryCount: 0,
                        },
                        { fields: ['id'], orderBy: { id: 'desc' } },
                    );

                    if (running) {
                        return {
                            outcome: 'skipped',
                            executionIds: [running.id],
                            reason: `execution ${running.id} of this blueprint is still running`,
                        };
                    }
                }

                return this.pipelineTriggerService.createExecutionsFromTrigger<
                    ScheduleTriggerInput,
                    ScheduleTriggerOutput
                >(em, ScheduleTriggerPipelineModule, {
                    matchNode: ({ blueprintEntity, node }) =>
                        blueprintEntity.id === blueprintId &&
                        (options.nodeId === undefined || node.id === options.nodeId),
                    buildNodeData: () => ({ firedAt }),
                    dryRun: options.dryRun ?? false,
                });
            });

        if (!Array.isArray(outcome)) {
            return outcome;
        }

        await this.pipelineTriggerService.scheduleCreatedExecutions(outcome);

        if (!outcome.length) {
            return {
                outcome: 'not-found',
                executionIds: [],
                reason: `blueprint ${blueprintId} has no schedule-trigger node${options.nodeId === undefined ? '' : ` with id ${options.nodeId}`}`,
            };
        }

        const executionIds = outcome.flatMap((result) => (result.status === 'created' ? [result.execution.id] : []));
        const failures = outcome.flatMap((result) =>
            result.status === 'failed' ? [String((result.error as Error)?.message ?? result.error)] : [],
        );

        return executionIds.length
            ? { outcome: 'started', executionIds }
            : { outcome: 'failed', executionIds, reason: failures.join('; ') || undefined };
    }

    private async doSyncSchedules(): Promise<void> {
        await this.pipelineModuleService.whenModulesReady();

        const triggers = await this.pipelineTriggerService.findMatchingTriggerNodes<
            ScheduleTriggerInput,
            ScheduleTriggerOutput
        >(this.em.fork(), ScheduleTriggerPipelineModule);
        const desired: DesiredSchedule[] = [];

        for (const { blueprintEntity, node } of triggers) {
            const schedule = toDesiredSchedule(blueprintEntity.id, node.id, node.constantInputData);

            if ('error' in schedule) {
                this.reportInvalid(
                    `${blueprintEntity.id}:${node.id}:${schedule.error}`,
                    `Blueprint "${blueprintEntity.title}" (${blueprintEntity.id}) is not scheduled: ${schedule.error}`,
                );
                continue;
            }

            desired.push(schedule);
        }

        const registered = await this.queue.getJobSchedulers();
        const plan = planScheduleSync(
            desired,
            registered.map((scheduler) => ({
                id: scheduler.id ?? scheduler.key,
                pattern: scheduler.pattern,
                tz: scheduler.tz,
            })),
        );

        for (const schedulerId of plan.remove) {
            await this.queue.removeJobScheduler(schedulerId);
            this.logger.log(`Removed schedule ${schedulerId}`);
        }

        for (const schedule of plan.upsert) {
            try {
                await this.queue.upsertJobScheduler(
                    schedule.schedulerId,
                    { pattern: schedule.pattern, ...(schedule.tz ? { tz: schedule.tz } : {}) },
                    {
                        name: SCHEDULE_TRIGGER_QUEUE,
                        data: { blueprintId: schedule.blueprintId, nodeId: schedule.nodeId },
                        opts: { attempts: 1, removeOnComplete: 100, removeOnFail: 100 },
                    },
                );
                this.logger.log(
                    `Scheduled blueprint ${schedule.blueprintId} (node ${schedule.nodeId}): "${schedule.pattern}"${schedule.tz ? ` ${schedule.tz}` : ''}`,
                );
            } catch (error) {
                this.reportInvalid(
                    `${schedule.schedulerId}:${schedule.pattern}:${schedule.tz}`,
                    `Blueprint ${schedule.blueprintId} is not scheduled, "${schedule.pattern}" was rejected: ${(error as Error).message}`,
                );
            }
        }
    }

    private reportInvalid(key: string, message: string): void {
        if (!this.reportedInvalid.has(key)) {
            this.reportedInvalid.add(key);
            this.logger.error(message);
        }
    }
}
