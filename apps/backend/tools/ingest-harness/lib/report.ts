import type { ActivityAnalysis } from './analyze-activities.js';

export interface TransformReportRow {
    sourceId: string;
    importer: string;
    importPath: string;
    durationMs?: number;
    heapDeltaBytes?: number;
    predictedCreated?: number;
    idealCreated?: number;
    analysis?: ActivityAnalysis;
    error?: string;
}

export interface TransformReport {
    generatedAt: string;
    rows: TransformReportRow[];
}

const mb = (bytes: number | undefined): string => (bytes === undefined ? '' : (bytes / 1024 / 1024).toFixed(1));
const num = (value: number | undefined): string => (value === undefined ? '' : value.toLocaleString('en-US'));

function delta(current: number | undefined, previous: number | undefined): string {
    if (current === undefined || previous === undefined || current === previous) {
        return '';
    }

    const diff = current - previous;
    return ` (${diff > 0 ? '+' : ''}${diff.toLocaleString('en-US')})`;
}

interface SourceTotals {
    files: number;
    errors: number;
    activities: number;
    predictedCreated: number;
    idealCreated: number;
    outputBytes: number;
    maxOutputBytes: number;
    durationMs: number;
    intraFileDuplicates: number;
    intraFileConflicts: number;
    objectReferences: number;
    distinctObjects: number;
    conflictingObjectKeySets: number;
    objectsWithoutKeys: number;
    skippedProblems: Record<string, number>;
    byType: Record<string, number>;
    stringified: Record<string, number>;
    timeMin?: string;
    timeMax?: string;
}

function totalsBySource(report: TransformReport): Map<string, SourceTotals> {
    const totals = new Map<string, SourceTotals>();

    for (const row of report.rows) {
        const t = totals.get(row.sourceId) ?? {
            files: 0,
            errors: 0,
            activities: 0,
            predictedCreated: 0,
            idealCreated: 0,
            outputBytes: 0,
            maxOutputBytes: 0,
            durationMs: 0,
            intraFileDuplicates: 0,
            intraFileConflicts: 0,
            objectReferences: 0,
            distinctObjects: 0,
            conflictingObjectKeySets: 0,
            objectsWithoutKeys: 0,
            skippedProblems: {},
            byType: {},
            stringified: {},
        };
        totals.set(row.sourceId, t);
        t.files++;

        if (row.error || !row.analysis) {
            t.errors++;
            continue;
        }

        const a = row.analysis;
        t.activities += a.activityCount;
        t.predictedCreated += row.predictedCreated ?? 0;
        t.idealCreated += row.idealCreated ?? 0;
        t.outputBytes += a.outputBytes;
        t.maxOutputBytes = Math.max(t.maxOutputBytes, a.outputBytes);
        t.durationMs += row.durationMs ?? 0;
        t.intraFileDuplicates += a.problems.intraFileDuplicateActivityKeys;
        t.intraFileConflicts += a.problems.intraFileConflictingActivityKeys;
        t.objectReferences += a.objects.references;
        t.distinctObjects += a.objects.distinct;
        t.conflictingObjectKeySets += a.problems.objectsWithConflictingKeySets;
        t.objectsWithoutKeys += a.problems.objectsWithoutStableKeys;

        for (const [type, count] of Object.entries(a.byType)) {
            t.byType[type] = (t.byType[type] ?? 0) + count;
        }

        for (const [property, count] of Object.entries(a.problems.stringifiedProperties)) {
            t.stringified[property] = (t.stringified[property] ?? 0) + count;
        }

        for (const key of ['activitiesWithoutStableKeys', 'endBeforeStart', 'missingOrInvalidStartTime'] as const) {
            if (a.problems[key]) {
                t.skippedProblems[key] = (t.skippedProblems[key] ?? 0) + a.problems[key];
            }
        }

        if (a.timeRange.min && (!t.timeMin || a.timeRange.min < t.timeMin)) {
            t.timeMin = a.timeRange.min;
        }

        if (a.timeRange.max && (!t.timeMax || a.timeRange.max > t.timeMax)) {
            t.timeMax = a.timeRange.max;
        }
    }

    return totals;
}

export function formatTransformReport(report: TransformReport, previous?: TransformReport): string {
    const current = totalsBySource(report);
    const before = previous ? totalsBySource(previous) : new Map<string, SourceTotals>();
    const lines: string[] = [
        `# Ingest transform report`,
        '',
        `Generated ${report.generatedAt}${previous ? `, deltas vs ${previous.generatedAt}` : ''}.`,
        '',
        '`created (today)` = what store-activity would write given everything earlier in the corpus, with',
        'today\'s dedup (only keys already in Postgres are skipped). `created (ideal)` = each new stable key',
        'once. The gap is duplicate activity nodes from keys repeated inside one file.',
        '',
        '| Source | Files | Errors | Activities | Created (today) | Created (ideal) | Dup keys in file | …conflicting | Objects refs → distinct | Output MB (max file) | Transform s | Range |',
        '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | ---: | --- |',
    ];

    for (const [sourceId, t] of current) {
        const p = before.get(sourceId);
        lines.push(
            `| ${sourceId} | ${t.files} | ${t.errors}${delta(t.errors, p?.errors)} | ${num(t.activities)}${delta(t.activities, p?.activities)} | ${num(t.predictedCreated)}${delta(t.predictedCreated, p?.predictedCreated)} | ${num(t.idealCreated)}${delta(t.idealCreated, p?.idealCreated)} | ${num(t.intraFileDuplicates)}${delta(t.intraFileDuplicates, p?.intraFileDuplicates)} | ${num(t.intraFileConflicts)} | ${num(t.objectReferences)} → ${num(t.distinctObjects)} | ${mb(t.outputBytes)} (${mb(t.maxOutputBytes)}) | ${(t.durationMs / 1000).toFixed(1)} | ${t.timeMin?.slice(0, 10) ?? ''} → ${t.timeMax?.slice(0, 10) ?? ''} |`,
        );
    }

    lines.push('', '## Per source', '');

    for (const [sourceId, t] of current) {
        lines.push(`### ${sourceId}`, '');
        lines.push(`- Types: ${Object.entries(t.byType).map(([k, v]) => `${k} ${num(v)}`).join(', ') || '—'}`);
        lines.push(`- Stringified nested properties: ${Object.entries(t.stringified).map(([k, v]) => `${k} ${num(v)}`).join(', ') || '—'}`);
        lines.push(`- Objects without stable keys: ${num(t.objectsWithoutKeys)}; objects linking separate key groups: ${num(t.conflictingObjectKeySets)}`);
        lines.push(`- Other: ${Object.entries(t.skippedProblems).map(([k, v]) => `${k} ${num(v)}`).join(', ') || '—'}`);

        const rows = report.rows.filter((r) => r.sourceId === sourceId);
        const errors = rows.filter((r) => r.error);

        for (const row of errors) {
            lines.push(`- **Error** in \`${row.importPath}\`: ${row.error}`);
        }

        const examples = rows.flatMap((r) => Object.entries(r.analysis?.examples ?? {}).map(([k, v]) => [k, v] as const));
        const shown = new Set<string>();

        for (const [problem, values] of examples) {
            if (shown.has(problem)) {
                continue;
            }

            shown.add(problem);
            lines.push(`- Example \`${problem}\`:`, '', '```json', JSON.stringify(values.slice(0, 2), null, 2).slice(0, 1500), '```');
        }

        lines.push('');
    }

    return lines.join('\n');
}
