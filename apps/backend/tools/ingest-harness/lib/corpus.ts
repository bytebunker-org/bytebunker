import fs from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import micromatch from 'micromatch';
import { corpusSources, type CorpusSource, type ImporterId } from '../corpus.manifest.js';

export const HARNESS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const BACKEND_DIR = resolve(HARNESS_DIR, '../..');
export const BLUEPRINT_DIR = join(HARNESS_DIR, 'blueprints');
export const CORPUS_DIR = resolve(process.env['INGEST_CORPUS_DIR'] ?? join(BACKEND_DIR, 'temp/ingest-corpus'));
export const REPORT_DIR = resolve(process.env['INGEST_REPORT_DIR'] ?? join(BACKEND_DIR, 'temp/ingest-harness'));
export const TAKEOUT_DIR = resolve(process.env['INGEST_TAKEOUT_DIR'] ?? join(homedir(), 'Documents/takeout'));

export interface CorpusFile {
    sourceId: string;
    importer: ImporterId;
    /** Path relative to the takeout root. */
    takeoutPath: string;
    /** Path relative to the import folder; also relative to `CORPUS_DIR` where the copy lives. */
    importPath: string;
    gunzip: boolean;
}

export async function walkFiles(root: string): Promise<{ path: string; size: number }[]> {
    const files: { path: string; size: number }[] = [];

    for (const entry of await fs.readdir(root, { recursive: true, withFileTypes: true })) {
        if (entry.isFile()) {
            const fullPath = join(entry.parentPath, entry.name);
            const { size } = await fs.stat(fullPath);

            files.push({ path: relative(root, fullPath), size });
        }
    }

    return files.sort((a, b) => a.path.localeCompare(b.path));
}

const asArray = <T>(value: T | T[]): T[] => (Array.isArray(value) ? value : [value]);

export function matchSource(source: CorpusSource, takeoutPaths: string[]): CorpusFile[] {
    return micromatch(takeoutPaths, asArray(source.from), { dot: false }).map((takeoutPath) => ({
        sourceId: source.id,
        importer: source.importer,
        takeoutPath,
        importPath: source.to(takeoutPath),
        gunzip: Boolean(source.gunzip),
    }));
}

/** Resolves the manifest against the takeout root. */
export async function resolveCorpusFromTakeout(): Promise<CorpusFile[]> {
    const takeoutPaths = (await walkFiles(TAKEOUT_DIR)).map((f) => f.path);

    return corpusSources.flatMap((source) => matchSource(source, takeoutPaths));
}

/**
 * Lists corpus files that were already synced into `CORPUS_DIR`, via the index `corpus.ts sync` writes.
 * Returns an empty list when nothing was synced, so the harness can skip instead of failing.
 */
export async function loadSyncedCorpus(filter?: { only?: string[]; importers?: ImporterId[] }): Promise<CorpusFile[]> {
    let files: CorpusFile[];

    try {
        files = JSON.parse(await fs.readFile(join(CORPUS_DIR, 'index.json'), 'utf8')) as CorpusFile[];
    } catch {
        return [];
    }

    return files.filter(
        (file) =>
            (!filter?.only?.length || filter.only.includes(file.sourceId) || filter.only.includes(file.importPath)) &&
            (!filter?.importers?.length || filter.importers.includes(file.importer)),
    );
}

export function corpusFilePath(file: CorpusFile): string {
    return join(CORPUS_DIR, file.importPath);
}

export function parseListEnv(name: string): string[] | undefined {
    const value = process.env[name];

    return value
        ? value
              .split(',')
              .map((v) => v.trim())
              .filter(Boolean)
        : undefined;
}
