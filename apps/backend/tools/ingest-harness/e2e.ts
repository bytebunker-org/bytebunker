/**
 * Tier 2 of the ingest harness: drive the real import path end to end against this worktree's own
 * Postgres + Neo4j + KeyDB index. Copies corpus files into the local-file trigger folder one at a time,
 * waits for each pipeline execution to finish, and records timings, graph deltas and invariants.
 *
 *   pnpm ingest:e2e --reset                         wipe graph + pipeline tables, install harness blueprints, run everything
 *   pnpm ingest:e2e --reset --only timeline-2026    one source (comma-separated ids or import paths)
 *   pnpm ingest:e2e --reset --sample 2000           first N records of each JSON export (fast smoke run)
 *   pnpm ingest:e2e --reimport                      after the run, drop every file again and expect no new nodes
 *   pnpm ingest:e2e --restart-during-import         kill + restart the backend while the first file is importing
 *   pnpm ingest:e2e --use-running                   use an already running backend instead of starting one
 *
 * Refuses to run against the main dev database or any config mentioning production hosts. `--reset`
 * deletes ALL blueprints, pipeline executions, pipeline assets, stable keys and graph nodes of this
 * worktree's instance.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import neo4j, { type Driver } from 'neo4j-driver';
import pg from 'pg';
import { importers, type ImporterId } from './corpus.manifest.js';
import {
    BACKEND_DIR,
    CORPUS_DIR,
    REPORT_DIR,
    corpusFilePath,
    loadSyncedCorpus,
    type CorpusFile,
} from './lib/corpus.js';
import type { TransformReport } from './lib/report.js';
import { loadHarnessEnv, type HarnessEnv } from './lib/worktree-env.js';

const POLL_MS = 1000;

const { values: args } = parseArgs({
    options: {
        reset: { type: 'boolean', default: false },
        only: { type: 'string' },
        sample: { type: 'string' },
        reimport: { type: 'boolean', default: false },
        'restart-during-import': { type: 'boolean', default: false },
        'use-running': { type: 'boolean', default: false },
        'keep-running': { type: 'boolean', default: false },
        'allow-main-database': { type: 'boolean', default: false },
        'file-timeout-min': { type: 'string', default: '60' },
        'stall-timeout-s': { type: 'string', default: '60' },
    },
});

const sampleSize = args.sample ? Number(args.sample) : undefined;
const fileTimeoutMs = Number(args['file-timeout-min']) * 60_000;
const stallTimeoutMs = Number(args['stall-timeout-s']) * 1000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (message: string) => console.log(`[ingest-e2e ${new Date().toISOString().slice(11, 19)}] ${message}`);

// ---------------------------------------------------------------------------------------------------------
// Backend process

class Backend {
    private process: ChildProcess | undefined;

    constructor(
        private readonly env: HarnessEnv,
        private readonly logPath: string,
    ) {}

    public async isHealthy(): Promise<boolean> {
        try {
            const response = await fetch(`${this.env.backendUrl}/health`, { signal: AbortSignal.timeout(2000) });
            return response.ok;
        } catch {
            return false;
        }
    }

    public async start(): Promise<void> {
        await fs.mkdir(dirname(this.logPath), { recursive: true });
        const output = createWriteStream(this.logPath, { flags: 'a' });

        // Same as `pnpm dev` minus --watch: compiles src, then runs the app with the worktree's config.
        this.process = spawn('pnpm', ['exec', 'nest', 'start'], {
            cwd: BACKEND_DIR,
            env: { ...process.env, NODE_ENV: 'development', TZ: 'UTC' },
            detached: true,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        this.process.stdout?.pipe(output);
        this.process.stderr?.pipe(output);

        const deadline = Date.now() + 180_000;

        while (Date.now() < deadline) {
            if (this.process.exitCode !== null) {
                throw new Error(`Backend exited with ${this.process.exitCode}, see ${this.logPath}`);
            }

            if (await this.isHealthy()) {
                // Health answers before onApplicationBootstrap work (module discovery, file watcher) is
                // guaranteed done; give it a moment.
                await sleep(2000);
                return;
            }

            await sleep(1000);
        }

        throw new Error(`Backend did not become healthy within 180 s, see ${this.logPath}`);
    }

    public async stop(signal: NodeJS.Signals = 'SIGTERM'): Promise<void> {
        const child = this.process;

        if (!child?.pid || child.exitCode !== null) {
            return;
        }

        const exited = new Promise((r) => child.once('exit', r));
        // Negative pid: the whole process group (pnpm → nest → node).
        process.kill(-child.pid, signal);
        await Promise.race([exited, sleep(20_000)]);

        if (child.exitCode === null) {
            process.kill(-child.pid, 'SIGKILL');
            await exited;
        }

        this.process = undefined;
    }
}

// ---------------------------------------------------------------------------------------------------------
// Database helpers

async function settingValue(db: pg.Client, key: string, fallback: string): Promise<string> {
    const { rows } = await db.query<{ value: string }>(
        `SELECT value FROM setting_value_entity WHERE setting_key = $1 LIMIT 1`,
        [key],
    );
    return rows[0]?.value ?? fallback;
}

async function importFolders(db: pg.Client) {
    const folder = async (key: string, fallback: string) => resolve(BACKEND_DIR, await settingValue(db, key, fallback));

    return {
        import: await folder('localFileTriggerImportFolder', './data/import'),
        finished: await folder('localFileTriggerImportFinishedFolder', './data/import-finished'),
        failed: await folder('localFileTriggerImportFailedFolder', './data/import-failed'),
        // Not a setting: the watcher derives it from the import folder.
        processing: `${await folder('localFileTriggerImportFolder', './data/import')}-processing`,
    };
}

async function resetInstance(db: pg.Client, graph: Driver, folders: Awaited<ReturnType<typeof importFolders>>) {
    log('reset: deleting graph nodes');
    const session = graph.session();

    try {
        await session.run('MATCH (n) CALL { WITH n DETACH DELETE n } IN TRANSACTIONS OF 10000 ROWS');
    } finally {
        await session.close();
    }

    log('reset: truncating pipeline executions, blueprints, pipeline assets, stable keys');
    await db.query('BEGIN');
    await db.query('TRUNCATE pipeline_execution_entity, pipeline_blueprint_entity, node_stable_key_entity CASCADE');
    // Asset rows deduplicate uploads by hash; rows copied from the main DB point at objects that only exist
    // in production storage, so a re-upload of the same file would resolve to a missing object.
    await db.query(`DELETE FROM asset_entity WHERE type = 'pipeline'`);
    await db.query('COMMIT');

    for (const folder of Object.values(folders)) {
        await fs.rm(folder, { recursive: true, force: true });
        await fs.mkdir(folder, { recursive: true });
    }
}

/**
 * The backend installs the blueprints its extensions ship when it boots (in the background). Wait until those the
 * corpus needs exist, so dropped files have something to match.
 */
async function waitForShippedBlueprints(db: pg.Client, importerIds: ImporterId[]): Promise<void> {
    const keys = [...new Set(importerIds.map((id) => importers[id].shippedBlueprint))];
    const deadline = Date.now() + 90_000;

    while (Date.now() < deadline) {
        const { rows } = await db.query<{ key: string }>(
            'SELECT key FROM pipeline_blueprint_entity WHERE key = ANY($1)',
            [keys],
        );

        if (rows.length === keys.length) {
            return;
        }

        await sleep(1000);
    }

    throw new Error(`Shipped blueprints ${keys.join(', ')} were not installed within 90 s, see the backend log`);
}

interface GraphCounts {
    labels: Record<string, number>;
    relationships: number;
}

async function graphCounts(graph: Driver): Promise<GraphCounts> {
    const session = graph.session({ defaultAccessMode: neo4j.session.READ });

    try {
        const labels = await session.run('MATCH (n) UNWIND labels(n) AS label RETURN label, count(*) AS count');
        const relationships = await session.run('MATCH ()-[r]->() RETURN count(r) AS count');

        return {
            labels: Object.fromEntries(labels.records.map((r) => [r.get('label') as string, Number(r.get('count'))])),
            relationships: Number(relationships.records[0]?.get('count') ?? 0),
        };
    } finally {
        await session.close();
    }
}

function diffCounts(
    before: GraphCounts,
    after: GraphCounts,
): { labels: Record<string, number>; relationships: number } {
    const labels: Record<string, number> = {};

    for (const label of new Set([...Object.keys(before.labels), ...Object.keys(after.labels)])) {
        const diff = (after.labels[label] ?? 0) - (before.labels[label] ?? 0);

        if (diff) {
            labels[label] = diff;
        }
    }

    return { labels, relationships: after.relationships - before.relationships };
}

async function stableKeyCount(db: pg.Client): Promise<number> {
    const { rows } = await db.query<{ count: string }>('SELECT count(*) FROM node_stable_key_entity');
    return Number(rows[0]!.count);
}

async function maxExecutionId(db: pg.Client): Promise<number> {
    const { rows } = await db.query<{ max: number | null }>('SELECT max(id) AS max FROM pipeline_execution_entity');
    return rows[0]!.max ?? 0;
}

interface ExecutionSnapshot {
    id: number;
    blueprint: string;
    status: string;
    errorRetryCount: number;
    latestErrorMessage: string | null;
    createdAt: Date;
    updatedAt: Date;
    nodes: { nodeId: number; status: string; createdAt: Date; updatedAt: Date; dataBytes: number; data: unknown }[];
}

async function executionsAfter(db: pg.Client, afterId: number): Promise<ExecutionSnapshot[]> {
    const { rows: executions } = await db.query(
        `SELECT e.id, b.title, e.execution_status, e.error_retry_count, e.latest_error_message, e.created_at, e.updated_at
         FROM pipeline_execution_entity e JOIN pipeline_blueprint_entity b ON b.id = e.blueprint_id
         WHERE e.id > $1 ORDER BY e.id`,
        [afterId],
    );

    const snapshots: ExecutionSnapshot[] = [];

    for (const e of executions) {
        // Only small outputs are fetched in full; activity arrays can be hundreds of MB.
        const { rows: nodes } = await db.query(
            `SELECT node_id, execution_status, created_at, updated_at, pg_column_size(data) AS data_bytes,
                    CASE WHEN pg_column_size(data) < 10000 THEN data END AS data
             FROM pipeline_execution_data_entity WHERE pipeline_execution_id = $1 ORDER BY node_id`,
            [e.id],
        );

        snapshots.push({
            id: e.id,
            blueprint: e.title,
            status: e.execution_status,
            errorRetryCount: e.error_retry_count,
            latestErrorMessage: e.latest_error_message,
            createdAt: e.created_at,
            updatedAt: e.updated_at,
            nodes: nodes.map((n) => ({
                nodeId: n.node_id,
                status: n.execution_status,
                createdAt: n.created_at,
                updatedAt: n.updated_at,
                dataBytes: Number(n.data_bytes ?? 0),
                data: n.data,
            })),
        });
    }

    return snapshots;
}

/** The file landed at `path` after `since` (a move updates ctime), not left over from an earlier pass. */
async function movedSince(path: string, since: number): Promise<boolean> {
    const stat = await fs.stat(path).catch(() => undefined);

    return Boolean(stat && stat.ctimeMs >= since - 1000);
}

const fingerprint = (executions: ExecutionSnapshot[]) =>
    JSON.stringify(executions.map((e) => [e.status, e.updatedAt, e.nodes.map((n) => [n.status, n.updatedAt])]));

// ---------------------------------------------------------------------------------------------------------
// Corpus → import folder

async function sampledCopy(file: CorpusFile, size: number): Promise<string> {
    const source = corpusFilePath(file);
    const target = join(CORPUS_DIR, '..', 'ingest-corpus-samples', String(size), file.importPath);
    await fs.mkdir(dirname(target), { recursive: true });
    // copyFile keeps the corpus copy's read-only mode, so a second run must remove the old sample first.
    await fs.rm(target, { force: true });

    const isJson = file.importPath.endsWith('.json');

    if (!isJson) {
        await fs.copyFile(source, target);
        return target;
    }

    const data = JSON.parse(await fs.readFile(source, 'utf8')) as unknown;

    if (Array.isArray(data)) {
        await fs.writeFile(target, JSON.stringify(data.slice(0, size)));
    } else if (data && typeof data === 'object') {
        const record = data as Record<string, unknown>;

        for (const key of ['semanticSegments', 'timelineObjects']) {
            if (Array.isArray(record[key])) {
                record[key] = (record[key] as unknown[]).slice(0, size);
            }
        }

        // rawSignals / userLocationProfile are not read by any importer; drop them to keep samples small.
        delete record['rawSignals'];
        await fs.writeFile(target, JSON.stringify(record));
    }

    return target;
}

interface FileResult {
    sourceId: string;
    importer: ImporterId;
    importPath: string;
    pass: 'import' | 'reimport';
    /** skipped: the duplicate-import guard recognised the content and started nothing. */
    outcome: 'success' | 'skipped' | 'failed' | 'stalled' | 'timeout' | 'no-pipeline' | 'multiple-pipelines';
    executions: {
        id: number;
        blueprint: string;
        status: string;
        error: string | null;
        errorRetryCount: number;
        /** Trigger node data written → node finished, per node. */
        nodeMs: Record<number, number>;
        nodeOutputBytes: Record<number, number>;
        storeOutput?: unknown;
    }[];
    wallMs: number;
    fileMovedTo?: 'finished' | 'failed';
    graphDelta: { labels: Record<string, number>; relationships: number };
    stableKeyDelta: number;
    predictedCreated?: number;
}

async function importFile(
    ctx: { db: pg.Client; graph: Driver; folders: Awaited<ReturnType<typeof importFolders>>; backend: Backend },
    file: CorpusFile,
    pass: FileResult['pass'],
    options: { restartDuringImport?: boolean; predictedCreated?: number } = {},
): Promise<FileResult> {
    const { db, graph, folders, backend } = ctx;
    const before = await graphCounts(graph);
    const keysBefore = await stableKeyCount(db);
    const lastId = await maxExecutionId(db);
    const source = sampleSize ? await sampledCopy(file, sampleSize) : corpusFilePath(file);
    const target = join(folders.import, file.importPath);
    const start = Date.now();

    // Stage outside the watched folder, then rename in: the watcher must only ever see the complete file.
    const staging = join(dirname(folders.import), '.ingest-harness-staging', file.importPath);
    await fs.mkdir(dirname(staging), { recursive: true });
    await fs.mkdir(dirname(target), { recursive: true });
    await fs.copyFile(source, staging);
    await fs.chmod(staging, 0o644);
    await fs.rename(staging, target);
    log(`${pass} ${file.sourceId} ${file.importPath}`);

    let executions: ExecutionSnapshot[] = [];
    let outcome: FileResult['outcome'] | undefined;
    let lastChange = Date.now();
    let lastFingerprint = '';
    // Row timestamps come from Postgres now(), i.e. the start of the writing transaction, which makes the
    // long store step look instant. Time nodes by when the poll first sees them finished instead (±1 s).
    const firstSeen = new Map<string, number>();
    let restarted = false;

    while (!outcome) {
        await sleep(POLL_MS);
        executions = await executionsAfter(db, lastId);

        for (const execution of executions) {
            if (!firstSeen.has(`${execution.id}`)) {
                firstSeen.set(`${execution.id}`, Date.now());
            }

            for (const node of execution.nodes) {
                const key = `${execution.id}:${node.nodeId}`;

                if (node.status !== 'waiting' && !firstSeen.has(key)) {
                    firstSeen.set(key, Date.now());
                }
            }
        }

        const currentFingerprint = fingerprint(executions);

        if (currentFingerprint !== lastFingerprint) {
            lastFingerprint = currentFingerprint;
            lastChange = Date.now();
        }

        if (!executions.length) {
            if (await movedSince(join(folders.finished, file.importPath), start)) {
                outcome = 'skipped';
            } else if (await movedSince(join(folders.failed, file.importPath), start)) {
                outcome = 'no-pipeline';
            } else if (Date.now() - start > 60_000) {
                outcome = 'no-pipeline';
            }

            continue;
        }

        if (options.restartDuringImport && !restarted) {
            restarted = true;
            log('restart-during-import: killing backend while the pipeline is running');
            await backend.stop('SIGKILL');
            await backend.start();
            log('restart-during-import: backend is back');
            lastChange = Date.now();
            continue;
        }

        const done = executions.every((e) => e.status === 'success' || e.status === 'failed' || e.status === 'aborted');

        if (done) {
            outcome = executions.every((e) => e.status === 'success') ? 'success' : 'failed';
        } else if (
            // A long store step writes nothing to the execution tables until it ends, so silence alone is not a
            // stall. An execution that recorded an error and then stopped changing is.
            executions.some((e) => e.status === 'waiting' && e.latestErrorMessage) &&
            Date.now() - lastChange > stallTimeoutMs
        ) {
            outcome = 'stalled';
        } else if (Date.now() - start > fileTimeoutMs) {
            outcome = 'timeout';
        }
    }

    if (outcome === 'success' && executions.length > 1) {
        outcome = 'multiple-pipelines';
    }

    // The watcher moves the file out of the processing folder once its executions ended (checked every few
    // seconds); give it time before recording where it went.
    let movedTo: FileResult['fileMovedTo'];

    for (let waited = 0; waited < 20_000 && !movedTo; waited += 500) {
        movedTo = (await movedSince(join(folders.finished, file.importPath), start))
            ? 'finished'
            : (await movedSince(join(folders.failed, file.importPath), start))
              ? 'failed'
              : undefined;

        if (!movedTo) {
            await sleep(500);
        }
    }

    const definition = importers[file.importer];

    const result: FileResult = {
        sourceId: file.sourceId,
        importer: file.importer,
        importPath: file.importPath,
        pass,
        outcome,
        executions: executions.map((e) => {
            const nodeMs: Record<number, number> = {};
            const nodeOutputBytes: Record<number, number> = {};
            let previousEnd = firstSeen.get(`${e.id}`) ?? start;

            for (const node of e.nodes.filter((n) => n.nodeId !== 1)) {
                const seen = firstSeen.get(`${e.id}:${node.nodeId}`);
                nodeOutputBytes[node.nodeId] = node.dataBytes;

                if (seen !== undefined) {
                    nodeMs[node.nodeId] = seen - previousEnd;
                    previousEnd = seen;
                }
            }

            return {
                id: e.id,
                blueprint: e.blueprint,
                status: e.status,
                error: e.latestErrorMessage,
                errorRetryCount: e.errorRetryCount,
                nodeMs,
                nodeOutputBytes,
                storeOutput: e.nodes.find((n) => n.nodeId === definition.storeNodeId)?.data,
            };
        }),
        wallMs: Date.now() - start,
        fileMovedTo: movedTo,
        graphDelta: diffCounts(before, await graphCounts(graph)),
        stableKeyDelta: (await stableKeyCount(db)) - keysBefore,
        predictedCreated: options.predictedCreated,
    };

    const store = result.executions[0]?.storeOutput as { createdCount?: number; existingCount?: number } | undefined;
    log(
        `  → ${outcome} in ${(result.wallMs / 1000).toFixed(1)} s, created ${store?.createdCount ?? '?'}, existing ${store?.existingCount ?? '?'}` +
            (options.predictedCreated !== undefined ? ` (tier-1 predicted ${options.predictedCreated})` : '') +
            (result.executions[0]?.error ? `, error: ${result.executions[0].error}` : ''),
    );

    return result;
}

// ---------------------------------------------------------------------------------------------------------
// Invariants over the final graph

async function invariants(db: pg.Client, graph: Driver) {
    const session = graph.session({ defaultAccessMode: neo4j.session.READ });
    const indexed = new Set(
        (await db.query<{ node_id: string }>('SELECT DISTINCT node_id FROM node_stable_key_entity')).rows.map(
            (r) => r.node_id,
        ),
    );

    try {
        const nodes = await session.run(
            `MATCH (n:ASObject) WHERE NOT n:Person
             RETURN CASE WHEN n:Activity THEN 'Activity' ELSE [l IN labels(n) WHERE l <> 'ASObject'][0] END AS kind, n.id AS id`,
        );
        const byKind: Record<string, { total: number; notIndexed: number }> = {};

        for (const record of nodes.records) {
            const kind = String(record.get('kind'));
            const entry = (byKind[kind] ??= { total: 0, notIndexed: 0 });
            entry.total++;

            if (!indexed.has(String(record.get('id')))) {
                entry.notIndexed++;
            }
        }

        const activitiesWithoutActor = await session.run(
            'MATCH (a:Activity) WHERE NOT (a)<-[:ACTED_IN]-(:Person) RETURN count(a) AS count',
        );
        const unconnectedObjects = await session.run(
            'MATCH (n:ASObject) WHERE NOT n:Activity AND NOT n:Person AND NOT (n)--() RETURN count(n) AS count',
        );

        const { rows: stuck } = await db.query(
            `SELECT count(*)::int AS count FROM pipeline_execution_entity WHERE execution_status = 'waiting'`,
        );

        return {
            /**
             * Nodes no stable key points to. Every imported node registers its keys; a node missing from the
             * index lost the key race to another node with the same key, i.e. it is a duplicate.
             */
            nodesNotInStableKeyIndex: byKind,
            activitiesWithoutActor: Number(activitiesWithoutActor.records[0]?.get('count') ?? 0),
            unconnectedObjects: Number(unconnectedObjects.records[0]?.get('count') ?? 0),
            executionsStillWaiting: stuck[0].count as number,
        };
    } finally {
        await session.close();
    }
}

// ---------------------------------------------------------------------------------------------------------
// Report

function formatReport(report: {
    generatedAt: string;
    options: Record<string, unknown>;
    results: FileResult[];
    finalGraph: GraphCounts;
    invariants: Awaited<ReturnType<typeof invariants>>;
}): string {
    const fmt = (n: number | undefined) => (n === undefined ? '' : n.toLocaleString('en-US'));
    const s = (ms: number | undefined) => (ms === undefined ? '' : (ms / 1000).toFixed(1));
    const lines = [
        '# Ingest e2e report',
        '',
        `Generated ${report.generatedAt}. Options: \`${JSON.stringify(report.options)}\``,
        '',
        '| Pass | File | Outcome | Wall s | Transform s | Store s | Transform output MB | Created | Existing | Tier-1 predicted | Activity nodes Δ | Stable keys Δ | Moved to | Error |',
        '| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |',
    ];

    for (const r of report.results) {
        const e = r.executions[0];
        const definition = importers[r.importer];
        const store = e?.storeOutput as { createdCount?: number; existingCount?: number } | undefined;
        lines.push(
            `| ${r.pass} | ${r.importPath} | ${r.outcome}${r.executions.length > 1 ? ` (${r.executions.length} pipelines)` : ''} | ${s(r.wallMs)} | ${s(definition ? e?.nodeMs[definition.transformNodeId] : undefined)} | ${s(definition ? e?.nodeMs[definition.storeNodeId] : undefined)} | ${definition && e ? ((e.nodeOutputBytes[definition.transformNodeId] ?? 0) / 1024 / 1024).toFixed(1) : ''} | ${fmt(store?.createdCount)} | ${fmt(store?.existingCount)} | ${fmt(r.predictedCreated)} | ${fmt(r.graphDelta.labels['Activity'])} | ${fmt(r.stableKeyDelta)} | ${r.fileMovedTo ?? ''} | ${(e?.error ?? '').slice(0, 120)} |`,
        );
    }

    const totalStoreMs = report.results.reduce((sum, r) => {
        const e = r.executions[0];
        const definition = importers[r.importer];
        return sum + (definition && e?.nodeMs[definition.storeNodeId] ? e.nodeMs[definition.storeNodeId]! : 0);
    }, 0);
    const totalCreated = report.results.reduce(
        (sum, r) => sum + ((r.executions[0]?.storeOutput as { createdCount?: number } | undefined)?.createdCount ?? 0),
        0,
    );

    lines.push(
        '',
        `Store throughput: ${fmt(totalCreated)} activities in ${s(totalStoreMs)} s` +
            (totalStoreMs ? ` = ${Math.round(totalCreated / (totalStoreMs / 1000))} activities/s` : ''),
        '',
        '## Final graph',
        '',
        '```json',
        JSON.stringify(report.finalGraph, null, 2),
        '```',
        '',
        '## Invariants',
        '',
        '`nodesNotInStableKeyIndex`: nodes whose id no stable key points at — duplicates that lost the key race.',
        '',
        '```json',
        JSON.stringify(report.invariants, null, 2),
        '```',
        '',
    );

    return lines.join('\n');
}

// ---------------------------------------------------------------------------------------------------------

async function main(): Promise<void> {
    const env = await loadHarnessEnv({ allowMainDatabase: args['allow-main-database'] });
    const only = args.only
        ?.split(',')
        .map((v) => v.trim())
        .filter(Boolean);
    const corpus = await loadSyncedCorpus({ only });

    if (!corpus.length) {
        throw new Error('No corpus files selected. Run `pnpm ingest:corpus sync` first, or check --only.');
    }

    const db = new pg.Client(env.postgres);
    await db.connect();
    const graph = neo4j.driver(env.neo4j.url, neo4j.auth.basic(env.neo4j.username, env.neo4j.password));
    const runId = new Date().toISOString().replaceAll(':', '-');
    const backend = new Backend(env, join(REPORT_DIR, `backend-${runId}.log`));
    const startedBackend = !args['use-running'];

    try {
        const alreadyRunning = await backend.isHealthy();

        if (alreadyRunning && startedBackend) {
            throw new Error(
                `A backend is already answering on ${env.backendUrl}. Stop it (its BullMQ workers would take the ` +
                    `harness jobs) or pass --use-running.`,
            );
        }

        if (!alreadyRunning && !startedBackend) {
            throw new Error(`--use-running given, but nothing answers on ${env.backendUrl}`);
        }

        const folders = await importFolders(db);

        if (args.reset) {
            if (alreadyRunning) {
                throw new Error(
                    '--reset needs the backend stopped (it caches the owner Person node and module state).',
                );
            }

            await resetInstance(db, graph, folders);
        }

        const predictions = sampleSize
            ? undefined
            : await fs
                  .readFile(join(REPORT_DIR, 'transform-latest.json'), 'utf8')
                  .then((raw) => JSON.parse(raw) as TransformReport)
                  .catch(() => undefined);
        // Tier-1 predictions assume the whole corpus imported in manifest order into an empty graph.
        const usePredictions = Boolean(args.reset && !only);

        if (startedBackend) {
            log(`starting backend (log: ${backend['logPath']})`);
            await backend.start();
        }

        await waitForShippedBlueprints(db, [...new Set(corpus.map((f) => f.importer))]);

        const ctx = { db, graph, folders, backend };
        const results: FileResult[] = [];

        for (const [index, file] of corpus.entries()) {
            const predictedCreated = usePredictions
                ? predictions?.rows.find((r) => r.importPath === file.importPath)?.predictedCreated
                : undefined;
            results.push(
                await importFile(ctx, file, 'import', {
                    restartDuringImport: args['restart-during-import'] && index === 0,
                    predictedCreated,
                }),
            );
        }

        if (args.reimport) {
            for (const file of corpus) {
                results.push(await importFile(ctx, file, 'reimport'));
            }
        }

        const report = {
            generatedAt: new Date().toISOString(),
            options: { ...args, files: corpus.length },
            results,
            finalGraph: await graphCounts(graph),
            invariants: await invariants(db, graph),
        };

        await fs.mkdir(REPORT_DIR, { recursive: true });
        await fs.writeFile(join(REPORT_DIR, `e2e-${runId}.json`), JSON.stringify(report, null, 2));
        await fs.writeFile(join(REPORT_DIR, 'e2e-latest.json'), JSON.stringify(report, null, 2));
        const markdown = formatReport(report);
        await fs.writeFile(join(REPORT_DIR, 'e2e-latest.md'), markdown);
        console.log(`\n${markdown}\nReport: ${join(REPORT_DIR, 'e2e-latest.md')}`);

        const failures = results.filter((r) => r.outcome !== 'success' && r.outcome !== 'skipped');
        process.exitCode = failures.length ? 1 : 0;
    } finally {
        if (startedBackend && !args['keep-running']) {
            await backend.stop();
        }

        await db.end();
        await graph.close();
    }
}

await main();
