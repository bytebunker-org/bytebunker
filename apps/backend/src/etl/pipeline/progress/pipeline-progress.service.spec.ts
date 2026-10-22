import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Redis } from 'ioredis';
import { PipelineProgressService } from './pipeline-progress.service.js';
import type { PipelineModuleService } from '../pipeline-module/pipeline-module.service.js';

describe('PipelineProgressService', () => {
    let service: PipelineProgressService;
    let redis: { multi: ReturnType<typeof vi.fn>; hdel: ReturnType<typeof vi.fn> };

    beforeEach(() => {
        const chain = {
            hset: vi.fn(() => chain),
            expire: vi.fn(() => chain),
            exec: vi.fn(() => Promise.resolve([])),
        };
        redis = { multi: vi.fn(() => chain), hdel: vi.fn(() => Promise.resolve(1)) };
        service = new PipelineProgressService(redis as unknown as Redis, {} as PipelineModuleService);
    });

    it('mirrors node progress as a percentage, e.g. into the BullMQ job', async () => {
        const mirror = vi.fn(() => Promise.resolve());
        const reporter = await service.startNode(1, 2, mirror);

        reporter.report({ current: 5, total: 10 });
        await reporter.finish('success');

        expect(mirror.mock.calls).toEqual([[50], [100]]);
    });

    it('does not mirror updates without a known total', async () => {
        const mirror = vi.fn(() => Promise.resolve());
        const reporter = await service.startNode(1, 2, mirror);

        reporter.message('reading');
        await reporter.finish('failed', 'boom');

        expect(mirror).not.toHaveBeenCalled();
    });

    it('clears the live state of reset nodes', async () => {
        await service.clearNodes(4, [2, 3]);
        await service.clearNodes(4, []);

        expect(redis.hdel).toHaveBeenCalledExactlyOnceWith('pipeline-progress:4', '2', '3');
    });
});
