/**
 * Tier 1 of the ingest harness: run every importer's transform module over the real export files in the
 * corpus (see `corpus.ts sync`) without any database, and check the output the store step will receive.
 *
 *   pnpm ingest:transform                         all synced corpus files
 *   INGEST_ONLY=timeline-2026 pnpm ingest:transform   one source id (comma-separated list allowed)
 *
 * Fails on problems that make persisting throw or corrupt the dedup index. Everything else lands in
 * temp/ingest-harness/transform-latest.{md,json}, with deltas against the previous run.
 */
import fs from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { relationshipInfoMap } from '../../src/activity-graph/schema/graph-schema.constant.js';
import { analyzeActivities, hardProblems, type ActivityAnalysis } from './lib/analyze-activities.js';
import { REPORT_DIR, loadSyncedCorpus, parseListEnv, type CorpusFile } from './lib/corpus.js';
import { importers } from './corpus.manifest.js';
import { applyDefaultGlobalSettings, runTransform } from './lib/run-transform.js';
import { formatTransformReport, type TransformReport, type TransformReportRow } from './lib/report.js';

const corpus = await loadSyncedCorpus({ only: parseListEnv('INGEST_ONLY') });
const relationshipKeys = new Set(Object.keys(relationshipInfoMap));
const rows: TransformReportRow[] = [];

/** Activity stable keys of everything "imported" so far, in corpus order, to predict cross-file dedup. */
const importedKeys = new Set<string>();

function predictDedup(activities: unknown[]): { predictedCreated: number; idealCreated: number } {
    // What the persister does today: an activity is skipped only if one of its keys existed before this
    // file; duplicates inside the file are all written.
    let predictedCreated = 0;
    // What a key-correct import would write: each new key once.
    let idealCreated = 0;
    const fileKeys = new Set<string>();

    for (const activity of activities as { stableKeys?: string[] }[]) {
        const keys = activity.stableKeys ?? [];

        if (keys.some((k) => importedKeys.has(k))) {
            continue;
        }

        predictedCreated++;

        if (!keys.some((k) => fileKeys.has(k))) {
            idealCreated++;
        }

        keys.forEach((k) => fileKeys.add(k));
    }

    fileKeys.forEach((k) => importedKeys.add(k));

    return { predictedCreated, idealCreated };
}

describe.skipIf(!corpus.length)('ingest transform harness', () => {
    beforeAll(() => {
        applyDefaultGlobalSettings();
    });

    afterAll(async () => {
        const report: TransformReport = { generatedAt: new Date().toISOString(), rows };
        await fs.mkdir(REPORT_DIR, { recursive: true });

        const latestJson = join(REPORT_DIR, 'transform-latest.json');
        const previous = await fs
            .readFile(latestJson, 'utf8')
            .then((raw) => JSON.parse(raw) as TransformReport)
            .catch(() => undefined);

        await fs.writeFile(
            join(REPORT_DIR, `transform-${report.generatedAt.replaceAll(':', '-')}.json`),
            JSON.stringify(report, null, 2),
        );
        await fs.writeFile(latestJson, JSON.stringify(report, null, 2));

        const markdown = formatTransformReport(report, previous);
        await fs.writeFile(join(REPORT_DIR, 'transform-latest.md'), markdown);
        console.log(`\n${markdown}\nReport: ${join(REPORT_DIR, 'transform-latest.md')}`);
    });

    it.each(corpus.map((file) => [`${file.sourceId} ${file.importPath}`, file] as [string, CorpusFile]))(
        '%s',
        async (_name, file) => {
            let analysis: ActivityAnalysis | undefined;

            try {
                const run = await runTransform(file);
                analysis = analyzeActivities(run.activities, relationshipKeys);
                const dedup = predictDedup(run.activities);

                rows.push({
                    sourceId: file.sourceId,
                    importer: file.importer,
                    importPath: file.importPath,
                    durationMs: Math.round(run.durationMs),
                    heapDeltaBytes: run.heapDeltaBytes,
                    ...dedup,
                    analysis,
                    skippedRows: run.skipped?.byReason,
                });
            } catch (error) {
                rows.push({
                    sourceId: file.sourceId,
                    importer: file.importer,
                    importPath: file.importPath,
                    error: error instanceof Error ? `${error.message}` : String(error),
                });

                throw error;
            }

            expect(hardProblems(analysis), JSON.stringify(analysis.examples, null, 2)).toEqual([]);

            const { maxConflicts } = importers[file.importer];
            expect(
                analysis.problems.intraFileConflictingActivityKeys,
                `conflicting activity keys: ${JSON.stringify(analysis.examples['intraFileConflictingActivityKeys'], null, 2)}`,
            ).toBeLessThanOrEqual(maxConflicts.activityKeys);
            expect(
                analysis.problems.objectsWithConflictingKeySets,
                `objects linking key groups: ${JSON.stringify(analysis.examples['objectsWithConflictingKeySets'], null, 2)}`,
            ).toBeLessThanOrEqual(maxConflicts.objectKeySets);
        },
    );
});

describe.runIf(!corpus.length)('ingest transform harness (no corpus)', () => {
    it.skip('run `pnpm ingest:corpus sync` first', () => {});
});
