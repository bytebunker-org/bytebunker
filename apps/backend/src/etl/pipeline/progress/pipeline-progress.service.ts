import { Inject, Injectable, Logger } from '@nestjs/common';
import type { EntityManager } from '@mikro-orm/postgresql';
import type { Redis } from 'ioredis';
import { REDIS_PROVIDER } from '../../../shared/redis/redis.constant.js';
import { PipelineExecutionEntity } from '../entity/pipeline-execution.entity.js';
import { PipelineExecutionDataEntity } from '../entity/pipeline-execution-data.entity.js';
import { Blueprint } from '../blueprint/util/blueprint.class.js';
import { PipelineModuleService } from '../pipeline-module/pipeline-module.service.js';
import { PipelineModuleTypeEnum } from '../pipeline-module/type/pipeline-module-type.enum.js';
import { PipelineExecutionStatusEnum } from '../type/pipeline-execution-status.enum.js';
import type { NodeProgressDto, NodeProgressStatus, PipelineProgressDto } from './dto/pipeline-progress.dto.js';
import type { ModuleProgressReporter, ModuleProgressUpdate } from './type/module-progress-reporter.interface.js';

/** Live node state kept in Redis while (and for a while after) a module runs. */
interface StoredNodeProgress extends ModuleProgressUpdate {
    status: 'running' | 'success' | 'failed';
    startedAt: string;
    updatedAt: string;
    finishedAt?: string;
}

const KEY_PREFIX = 'pipeline-progress:';
const TTL_SECONDS = 14 * 24 * 60 * 60;
const MIN_WRITE_INTERVAL_MS = 250;

/**
 * Tracks what each module of a running pipeline is doing. Modules report through a {@link ModuleProgressReporter};
 * updates go to one Redis hash per execution (cheap, survives restarts, readable from any process). The pipeline
 * progress combines that with the persisted node statuses, weighted by each module's `progressWeight`.
 */
@Injectable()
export class PipelineProgressService {
    private readonly logger = new Logger(PipelineProgressService.name);

    constructor(
        @Inject(REDIS_PROVIDER) private readonly redis: Redis,
        private readonly moduleService: PipelineModuleService,
    ) {}

    /**
     * Marks the node as running and returns a throttled reporter for the module. Call {@link finishNode} when the
     * module returns or throws; it flushes the last pending update.
     */
    public async startNode(executionId: number, nodeId: number): Promise<ThrottledReporter> {
        const now = new Date().toISOString();
        const initial: StoredNodeProgress = { status: 'running', startedAt: now, updatedAt: now };

        await this.write(executionId, nodeId, initial);

        return new ThrottledReporter(initial, (state) => this.write(executionId, nodeId, state), this.logger);
    }

    public async finishNode(
        reporter: ThrottledReporter,
        status: 'success' | 'failed',
        message?: string,
    ): Promise<void> {
        await reporter.finish(status, message);
    }

    /** Forgets the live state of nodes that are about to run again, so they show as waiting until they start. */
    public async clearNodes(executionId: number, nodeIds: number[]): Promise<void> {
        if (nodeIds.length) {
            await this.redis.hdel(KEY_PREFIX + executionId, ...nodeIds.map(String));
        }
    }

    public async getProgress(em: EntityManager, executionId: number): Promise<PipelineProgressDto> {
        const execution = await em.findOneOrFail(
            PipelineExecutionEntity,
            { id: executionId },
            { populate: ['blueprint'], fields: ['id', 'executionStatus', 'dryRun', 'blueprint.data'] },
        );
        const executionData = await em.find(
            PipelineExecutionDataEntity,
            { pipelineExecution: executionId },
            { fields: ['nodeId', 'executionStatus'] },
        );
        const stored = await this.readAll(executionId);
        const blueprint = new Blueprint(execution.blueprint.$.data);
        const persistedStatus = new Map(executionData.map((d) => [d.nodeId, d.executionStatus]));

        let weightSum = 0;
        let doneSum = 0;
        let message: string | undefined;
        const nodes: NodeProgressDto[] = [];

        for (const node of blueprint.getNodes()) {
            const live = stored.get(node.id);
            const status = this.resolveStatus(persistedStatus.get(node.id), live);
            const fraction = this.nodeFraction(status, live);
            const weight = this.nodeWeight(node.moduleId);

            weightSum += weight;
            doneSum += weight * (fraction ?? 0);

            if (status === 'running' && live?.message) {
                message = live.message;
            }

            nodes.push({
                nodeId: node.id,
                status,
                fraction,
                current: live?.current,
                total: live?.total,
                unit: live?.unit,
                message: live?.message,
                startedAt: live?.startedAt,
                updatedAt: live?.updatedAt,
                finishedAt: live?.finishedAt,
            });
        }

        const isFinished = execution.executionStatus === PipelineExecutionStatusEnum.SUCCESS;

        return {
            executionId,
            executionStatus: execution.executionStatus,
            dryRun: execution.dryRun,
            fraction: isFinished ? 1 : weightSum ? doneSum / weightSum : 0,
            message,
            nodes,
        };
    }

    private resolveStatus(
        persisted: PipelineExecutionStatusEnum | undefined,
        live: StoredNodeProgress | undefined,
    ): NodeProgressStatus {
        // A node that is running again (retry) has a persisted FAILED row but a fresh "running" live state.
        if (live?.status === 'running') {
            return 'running';
        }

        switch (persisted) {
            case PipelineExecutionStatusEnum.SUCCESS:
                return 'success';
            case PipelineExecutionStatusEnum.FAILED:
                return 'failed';
            case PipelineExecutionStatusEnum.ABORTED:
                return 'aborted';
            case PipelineExecutionStatusEnum.BRANCH_IGNORED:
                return 'branch-ignored';
            default:
                return 'waiting';
        }
    }

    private nodeFraction(status: NodeProgressStatus, live: StoredNodeProgress | undefined): number | undefined {
        if (status === 'success' || status === 'branch-ignored') {
            return 1;
        }

        if (status === 'running') {
            return live?.total && live.current !== undefined ? Math.min(1, live.current / live.total) : undefined;
        }

        return 0;
    }

    private nodeWeight(moduleId: string): number {
        const options = this.moduleService.getPipelineModuleOptions(moduleId as never);

        if (options?.progressWeight !== undefined) {
            return options.progressWeight;
        }

        return options?.type === PipelineModuleTypeEnum.TRIGGER ? 0 : 1;
    }

    private async write(executionId: number, nodeId: number, state: StoredNodeProgress): Promise<void> {
        const key = KEY_PREFIX + executionId;

        await this.redis.multi().hset(key, String(nodeId), JSON.stringify(state)).expire(key, TTL_SECONDS).exec();
    }

    private async readAll(executionId: number): Promise<Map<number, StoredNodeProgress>> {
        const raw = await this.redis.hgetall(KEY_PREFIX + executionId);

        return new Map(
            Object.entries(raw).map(([nodeId, json]) => [Number(nodeId), JSON.parse(json) as StoredNodeProgress]),
        );
    }
}

/**
 * Keeps the latest state in memory and writes it at most every {@link MIN_WRITE_INTERVAL_MS}. A trailing write
 * makes sure the last update before a pause is not lost.
 */
export class ThrottledReporter implements ModuleProgressReporter {
    private lastWrite = 0;
    private trailingTimer: NodeJS.Timeout | undefined;
    private pendingWrite: Promise<void> = Promise.resolve();

    constructor(
        private state: StoredNodeProgress,
        private readonly persist: (state: StoredNodeProgress) => Promise<void>,
        private readonly logger: Logger,
    ) {}

    public report(update: ModuleProgressUpdate): void {
        if (this.state.status !== 'running') {
            return;
        }

        this.state = { ...this.state, ...stripUndefined(update), updatedAt: new Date().toISOString() };
        const wait = this.lastWrite + MIN_WRITE_INTERVAL_MS - Date.now();

        if (wait <= 0) {
            this.flush();
        } else {
            this.trailingTimer ??= setTimeout(() => this.flush(), wait);
        }
    }

    public message(message: string): void {
        this.report({ message });
    }

    public async finish(status: 'success' | 'failed', message?: string): Promise<void> {
        const now = new Date().toISOString();
        this.state = {
            ...this.state,
            ...(message !== undefined ? { message } : {}),
            // A finished node with a known total shows it complete.
            ...(status === 'success' && this.state.total !== undefined ? { current: this.state.total } : {}),
            status,
            updatedAt: now,
            finishedAt: now,
        };
        this.flush();
        await this.pendingWrite;
    }

    private flush(): void {
        clearTimeout(this.trailingTimer);
        this.trailingTimer = undefined;
        this.lastWrite = Date.now();
        const snapshot = this.state;

        // Writes are chained so a slow write cannot overtake a newer one.
        this.pendingWrite = this.pendingWrite
            .then(() => this.persist(snapshot))
            .catch((error: unknown) => this.logger.warn('Could not store pipeline progress', error));
    }
}

function stripUndefined<T extends object>(value: T): Partial<T> {
    return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;
}
