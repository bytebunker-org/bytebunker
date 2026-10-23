import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { EntityManager } from '@mikro-orm/postgresql';
import { FileImportService } from './file-import.service.js';
import { Blueprint } from '../../../etl/pipeline/blueprint/util/blueprint.class.js';
import type { PipelineTriggerService } from '../../../etl/pipeline/execution/pipeline-trigger.service.js';
import type { PipelineModuleService } from '../../../etl/pipeline/pipeline-module/pipeline-module.service.js';
import type { AssetService } from '../../../etl/asset/asset.service.js';
import type { FileSample } from '../../../etl/import/type/file-detection.interface.js';
import { buildFileSampleFromHead } from '../../../etl/import/file-sample.util.js';

const TIMELINE_MODULE = 'google:transform-timeline@1';
const SCRIPT_MODULE = 'bytebunker-core:execute-code@1';

function triggerBlueprint(id: number, title: string, triggerInput: Record<string, unknown>, moduleId: string) {
    const blueprint = new Blueprint({
        nodes: [
            {
                id: 1,
                moduleId: 'common-pipeline-triggers:local-file-trigger@1',
                position: { x: 0, y: 0 },
                constantInputData: triggerInput,
            },
            { id: 2, moduleId, position: { x: 0, y: 0 }, constantInputData: {} },
        ],
        edges: [{ id: 0, source: 1, target: 2, sourceHandle: 'fileAsset', targetHandle: 'rawJson' }],
    } as never);

    return { blueprintEntity: { id, title }, blueprint, node: blueprint.getNode(1)! };
}

describe('FileImportService routing', () => {
    let dir: string;
    let service: FileImportService;
    let triggers: ReturnType<typeof triggerBlueprint>[];
    const em = { fork: (): unknown => em } as unknown as EntityManager;

    beforeAll(async () => {
        dir = await fs.mkdtemp(join(tmpdir(), 'file-import-spec-'));
        await fs.writeFile(join(dir, 'Timeline.json'), '{\n  "semanticSegments": [ ]\n}');
        await fs.writeFile(
            join(dir, 'Streaming_History_Audio_2024.json'),
            '[ { "ts": "2024-01-01T00:00:00Z", "ms_played": 5 } ]',
        );
        await fs.writeFile(join(dir, 'notes.txt'), 'hello');
    });

    afterAll(async () => {
        await fs.rm(dir, { recursive: true, force: true });
    });

    beforeEach(() => {
        triggers = [
            triggerBlueprint(1, 'Timeline', { globPatterns: ['google/timeline/timeline.json'] }, TIMELINE_MODULE),
            triggerBlueprint(
                2,
                'Spotify script',
                { globPatterns: ['spotify/*.json'], contentPatterns: ['"ms_played"\\s*:'] },
                SCRIPT_MODULE,
            ),
        ];

        const pipelineTriggerService = {
            findMatchingTriggerNodes: vi.fn(() => Promise.resolve(triggers)),
        } as unknown as PipelineTriggerService;
        const pipelineModuleService = {
            whenModulesReady: () => Promise.resolve(),
            getPipelineModule: (id: string) =>
                id === TIMELINE_MODULE
                    ? {
                          detectFile: (sample: FileSample) =>
                              sample.head.includes('"semanticSegments"')
                                  ? { confidence: 0.95, format: 'Google Timeline' }
                                  : undefined,
                      }
                    : {},
        } as unknown as PipelineModuleService;

        service = new FileImportService(em, pipelineTriggerService, pipelineModuleService, {} as AssetService);
    });

    it('routes by glob first', async () => {
        const routing = await service.route(em, {
            absolutePath: join(dir, 'Timeline.json'),
            relativePath: 'google/timeline/timeline.json',
        });

        expect(routing.matches).toEqual([{ blueprintId: 1, blueprintTitle: 'Timeline', matchedBy: 'glob' }]);
    });

    it('routes a renamed file by the importer recognising its content', async () => {
        const routing = await service.route(em, {
            absolutePath: join(dir, 'Timeline.json'),
            relativePath: 'Standortverlauf/Zeitachse.json',
        });

        expect(routing.matches).toEqual([
            {
                blueprintId: 1,
                blueprintTitle: 'Timeline',
                matchedBy: 'content-detection',
                detection: { confidence: 0.95, format: 'Google Timeline' },
            },
        ]);
        expect(routing.format).toBe('Google Timeline');
    });

    it('routes by a trigger content pattern for modules that cannot detect files themselves', async () => {
        const routing = await service.route(em, {
            absolutePath: join(dir, 'Streaming_History_Audio_2024.json'),
            relativePath: 'my_spotify_data/Streaming_History_Audio_2024.json',
        });

        expect(routing.matches).toEqual([
            { blueprintId: 2, blueprintTitle: 'Spotify script', matchedBy: 'content-pattern' },
        ]);
    });

    it('does not use content detection when a rule already matched another blueprint', async () => {
        triggers.push(triggerBlueprint(3, 'Catch-all timeline', { globPatterns: [] }, TIMELINE_MODULE));

        const routing = await service.route(em, {
            absolutePath: join(dir, 'Timeline.json'),
            relativePath: 'google/timeline/timeline.json',
        });

        expect(routing.matches.map((match) => match.blueprintId)).toEqual([1]);
    });

    it('respects detectByContent: false', async () => {
        triggers[0] = triggerBlueprint(1, 'Timeline', { globPatterns: ['x'], detectByContent: false }, TIMELINE_MODULE);

        const routing = await service.route(em, {
            absolutePath: join(dir, 'Timeline.json'),
            relativePath: 'Zeitachse.json',
        });

        expect(routing.matches).toEqual([]);
    });

    it('explains files nothing reads', async () => {
        const result = await service.route(em, { absolutePath: join(dir, 'notes.txt'), relativePath: 'notes.txt' });

        expect(result.matches).toEqual([]);
        expect(result.considered.map((c) => c.blueprintTitle)).toEqual(['Timeline', 'Spotify script']);
    });

    it('previews files from their heads without storing anything', async () => {
        const [timeline, notes] = await service.previewSamples([
            buildFileSampleFromHead('Zeitachse.json', 50_000_000, Buffer.from('{ "semanticSegments": [')),
            buildFileSampleFromHead('notes.txt', 5, Buffer.from('hello')),
        ]);

        expect(timeline).toMatchObject({
            relativePath: 'Zeitachse.json',
            size: 50_000_000,
            matches: [
                {
                    blueprintId: 1,
                    blueprintTitle: 'Timeline',
                    matchedBy: 'content-detection',
                    format: 'Google Timeline',
                    confidence: 0.95,
                },
            ],
            format: 'Google Timeline',
            conflict: false,
        });
        expect(notes.matches).toEqual([]);
        expect(notes.message).toContain('No blueprint matched');
    });

    it('flags a conflict when several blueprints would import a file', async () => {
        triggers.push(triggerBlueprint(3, 'Timeline copy', { globPatterns: ['**/timeline.json'] }, TIMELINE_MODULE));

        const [preview] = await service.previewSamples([
            buildFileSampleFromHead('google/timeline/timeline.json', 10, Buffer.from('{}')),
        ]);

        expect(preview.matches.map((match) => match.blueprintTitle)).toEqual(['Timeline', 'Timeline copy']);
        expect(preview.conflict).toBe(true);
    });

    it('ignores media and system files', () => {
        expect(service.isIgnored('Google Fotos/2019/IMG_1.jpg')).toBe(true);
        expect(service.isIgnored('__MACOSX/a.json')).toBe(true);
        expect(service.isIgnored('google/timeline/timeline.json')).toBe(false);
    });
});

describe('FileImportService.importFile', () => {
    it('queues the created executions only after the import transaction committed', async () => {
        const order: string[] = [];
        const triggerResults = [
            { status: 'created', blueprintId: 1, blueprintTitle: 'Timeline', nodeId: 1, execution: { id: 5 } },
        ];
        const em = {
            fork: () => ({
                transactional: async <T>(callback: (em: EntityManager) => Promise<T>) => {
                    const result = await callback({} as EntityManager);
                    order.push('commit');

                    return result;
                },
            }),
        } as unknown as EntityManager;
        const pipelineTriggerService = {
            createExecutionsFromTrigger: vi.fn(() => {
                order.push('create');

                return Promise.resolve(triggerResults);
            }),
            scheduleCreatedExecutions: vi.fn(() => {
                order.push('schedule');

                return Promise.resolve();
            }),
        } as unknown as PipelineTriggerService;
        const service = new FileImportService(
            em,
            pipelineTriggerService,
            {} as PipelineModuleService,
            {} as AssetService,
        );
        vi.spyOn(service, 'route').mockResolvedValue({
            sample: { relativePath: 'timeline.json', size: 3 } as FileSample,
            matches: [{ blueprintId: 1, blueprintTitle: 'Timeline', matchedBy: 'glob' }],
            considered: [],
        });

        const result = await service.importFile({ absolutePath: '/tmp/timeline.json', relativePath: 'timeline.json' });

        expect(order).toEqual(['create', 'commit', 'schedule']);
        expect(pipelineTriggerService.scheduleCreatedExecutions).toHaveBeenCalledWith(triggerResults);
        expect(result.outcome).toBe('started');
    });
});
