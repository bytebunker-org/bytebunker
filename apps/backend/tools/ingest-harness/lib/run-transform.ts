/**
 * Runs a blueprint's transform module directly on a corpus file, with the services it needs stubbed out:
 * no Postgres, Neo4j, Redis or asset storage. Needs SWC decorator support, so it runs under vitest.
 */
import { NOOP_MODULE_PROGRESS_REPORTER } from '../../../src/etl/pipeline/progress/type/module-progress-reporter.interface.js';
import fs from 'node:fs/promises';
import { join } from 'node:path';
import type { EntityManager } from '@mikro-orm/postgresql';
import { setGlobalSettings } from '../../../src/shared/setting/global-setting.constant.js';
import { ActivityStableKeyService } from '../../../src/activity-graph/activity-stable-key.service.js';
import type { AssetService } from '../../../src/etl/asset/asset.service.js';
import type { ActivityGraphService } from '../../../src/activity-graph/activity-graph.service.js';
import type { ActivityGraphNodeService } from '../../../src/activity-graph/activity-graph-node.service.js';
import type { AssetDto } from '../../../src/etl/asset/dto/asset.dto.js';
import type { BlueprintDataDto } from '../../../src/etl/pipeline/blueprint/dto/blueprint-data.dto.js';
import { Blueprint } from '../../../src/etl/pipeline/blueprint/util/blueprint.class.js';
import type { IPipelineModule } from '../../../src/etl/pipeline/pipeline-module/type/pipeline-module.interface.js';
import { TransformTimelinePipelineModule } from '../../../src/extension/extensions/google/pipeline-module/transform-timeline.pipeline-module.js';
import { TransformSemanticLocationHistoryPipelineModule } from '../../../src/extension/extensions/google/pipeline-module/transform-semantic-location-history.pipeline-module.js';
import { TransformYouTubeWatchHistoryPipelineModule } from '../../../src/extension/extensions/youtube/pipeline-module/transform-youtube-watch-history.pipeline-module.js';
import { ParseIcsFilePipelineModule } from '../../../src/extension/extensions/ics-calendar/pipeline-module/parse-ics-file.pipeline-module.js';
import { ParseWhatsappChatPipelineModule } from '../../../src/extension/extensions/whatsapp/pipeline-module/parse-whatsapp-chat.pipeline-module.js';
import { ExecuteCodePipelineModule } from '../../../src/etl/pipeline/pipeline-module/core-module/execute-code.pipeline-module.js';
import { importers, type ImporterId } from '../corpus.manifest.js';
import { BLUEPRINT_DIR, corpusFilePath, type CorpusFile } from './corpus.js';

export const HARNESS_ACTOR_ID = 'ingest-harness-owner';

interface ModuleServices {
    assetService: AssetService;
    stableKeyService: ActivityStableKeyService;
    graphService: ActivityGraphService;
    graphNodeService: ActivityGraphNodeService;
}
type AnyModule = IPipelineModule<Record<string, unknown>, unknown>;

const moduleFactories: Record<ImporterId, (s: ModuleServices) => AnyModule> = {
    'google-timeline': (s) =>
        new TransformTimelinePipelineModule(
            s.assetService,
            s.stableKeyService,
            s.graphService,
            s.graphNodeService,
        ) as never,
    'google-semantic-location-history': (s) =>
        new TransformSemanticLocationHistoryPipelineModule(
            s.assetService,
            s.stableKeyService,
            s.graphService,
            s.graphNodeService,
        ) as never,
    'youtube-watch-history': (s) =>
        new TransformYouTubeWatchHistoryPipelineModule(
            s.assetService,
            s.stableKeyService,
            s.graphService,
            s.graphNodeService,
        ) as never,
    'ics-calendar': (s) =>
        new ParseIcsFilePipelineModule(s.assetService, s.stableKeyService, s.graphService, s.graphNodeService) as never,
    whatsapp: (s) => new ParseWhatsappChatPipelineModule(s.assetService, s.graphService, s.graphNodeService) as never,
    'spotify-streaming-history-script': (s) =>
        new ExecuteCodePipelineModule(s.graphService, s.graphNodeService, s.stableKeyService, s.assetService) as never,
};

/** Same defaults as `settingsConfig` (eventUniqueLocationPrecision / eventUniqueDateTimePrecision). */
export function applyDefaultGlobalSettings(): void {
    setGlobalSettings({
        eventUniqueLocationPrecisionSetting: 5,
        eventUniqueDateTimePrecisionSetting: 'second',
    } as Parameters<typeof setGlobalSettings>[0]);
}

function createServices(): ModuleServices {
    const assetService = {
        getAssetString: (_em: EntityManager, asset: AssetDto) => fs.readFile(asset.storagePath!, 'utf8'),
        getAsset: (_em: EntityManager, asset: AssetDto) => fs.readFile(asset.storagePath!),
    } as unknown as AssetService;
    // Neither constructor argument is used by the stable-key methods.
    const stableKeyService = new ActivityStableKeyService(undefined as never, undefined as never);
    const graphService = {
        getOwnerActor: () => Promise.resolve({ get: (key: string) => (key === 'id' ? HARNESS_ACTOR_ID : undefined) }),
        // An empty graph: `skipAlreadyImported` then emits everything.
        getLatestActivityStartTime: () => Promise.resolve(undefined),
    } as unknown as ActivityGraphService;
    const graphNodeService = {
        getExtension: (_em: EntityManager, id: string) =>
            Promise.resolve({ '@id': `extension/${id}`, '@type': 'Extension', name: id }),
    } as unknown as ActivityGraphNodeService;

    return { assetService, stableKeyService, graphService, graphNodeService };
}

export async function loadBlueprint(importer: ImporterId): Promise<BlueprintDataDto> {
    const raw = await fs.readFile(join(BLUEPRINT_DIR, importers[importer].blueprintFile), 'utf8');

    return JSON.parse(raw) as BlueprintDataDto;
}

export interface TransformRun {
    activities: unknown[];
    durationMs: number;
    heapDeltaBytes: number;
}

export async function runTransform(file: CorpusFile): Promise<TransformRun> {
    const definition = importers[file.importer];
    const blueprintData = await loadBlueprint(file.importer);
    const blueprint = new Blueprint(blueprintData);
    const node = blueprint.getNode(definition.transformNodeId);

    if (!node) {
        throw new Error(`Blueprint ${definition.blueprintFile} has no node ${definition.transformNodeId}`);
    }

    // Wire the trigger's `fileAsset` output into whichever input handle the blueprint connects it to.
    const inputData: Record<string, unknown> = structuredClone(node.constantInputData ?? {});
    const fullPath = corpusFilePath(file);
    const { size } = await fs.stat(fullPath);
    const asset = {
        id: `corpus:${file.importPath}`,
        storagePath: fullPath,
        originalFilename: file.importPath.slice(file.importPath.lastIndexOf('/') + 1),
        size,
    } as unknown as AssetDto;

    for (const edge of blueprint.getInputEdgesAtNode(node)) {
        inputData[edge.targetHandle] = asset;
    }

    const module = moduleFactories[file.importer](createServices());
    const em = {} as EntityManager;

    const heapBefore = process.memoryUsage().heapUsed;
    const start = performance.now();
    const output = (await module.executeModule({
        em,
        pipelineExecution: { id: 0, blueprint: { id: 0 } } as never,
        blueprint,
        currentNode: node,
        inputData,
        progress: NOOP_MODULE_PROGRESS_REPORTER,
        dryRun: true,
    })) as { activities?: unknown[] };
    const durationMs = performance.now() - start;
    const heapDeltaBytes = process.memoryUsage().heapUsed - heapBefore;

    if (!output || !Array.isArray(output.activities)) {
        throw new Error(`Transform for ${file.importPath} returned no activities array`);
    }

    // The engine stores module output as JSONB and the next node reads it back: luxon DateTimes become ISO
    // strings, undefined disappears. Analyse what store-activity will actually receive.
    const activities = JSON.parse(JSON.stringify(output.activities)) as unknown[];

    return { activities, durationMs, heapDeltaBytes };
}
