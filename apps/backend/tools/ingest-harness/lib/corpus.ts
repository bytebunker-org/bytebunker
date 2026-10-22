import fs from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import micromatch from 'micromatch';
import { corpusSources, type CorpusRoot, type CorpusSource, type ImporterId } from '../corpus.manifest.js';

export const HARNESS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const BACKEND_DIR = resolve(HARNESS_DIR, '../..');
export const SHIPPED_BLUEPRINT_DIR = join(BACKEND_DIR, 'src/extension/extensions');

/** Path of a blueprint shipped by an extension, by its key `<extension folder>/<name>`. */
export function shippedBlueprintPath(key: string): string {
    const [extension, name] = key.split('/');

    return join(SHIPPED_BLUEPRINT_DIR, extension!, 'blueprints', `${name}.blueprint.json`);
}
export const CORPUS_DIR = resolve(process.env['INGEST_CORPUS_DIR'] ?? join(BACKEND_DIR, 'temp/ingest-corpus'));
export const REPORT_DIR = resolve(process.env['INGEST_REPORT_DIR'] ?? join(BACKEND_DIR, 'temp/ingest-harness'));
export const TAKEOUT_DIR = resolve(process.env['INGEST_TAKEOUT_DIR'] ?? join(homedir(), 'Documents/takeout'));
export const HOME_DIR = resolve(process.env['INGEST_HOME_DIR'] ?? homedir());

export function corpusRootDir(root: CorpusRoot | undefined): string {
    return root === 'home' ? HOME_DIR : TAKEOUT_DIR;
}

export interface CorpusFile {
    sourceId: string;
    importer: ImporterId;
    /** Root `takeoutPath` is relative to; absent means the takeout root. */
    root?: CorpusRoot;
    /** Path relative to the source root (the takeout root unless `root` says otherwise). */
    takeoutPath: string;
    /** Path relative to the import folder; also relative to `CORPUS_DIR` where the copy lives. */
    importPath: string;
    gunzip: boolean;
    /** SQLite database whose `-wal` is folded into the copy. */
    sqlite?: boolean;
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
        ...(source.root && source.root !== 'takeout' ? { root: source.root } : {}),
        ...(source.sqlite ? { sqlite: true } : {}),
    }));
}

/**
 * Lists the files under `root` a home-rooted source can match. The home directory is far too big to walk, so only
 * the static part of each pattern (before the first glob) is walked.
 */
async function listHomeCandidates(source: CorpusSource): Promise<string[]> {
    const paths = new Set<string>();

    for (const pattern of asArray(source.from)) {
        const { base, isGlob } = micromatch.scan(pattern);
        const absoluteBase = join(HOME_DIR, base);

        if (!isGlob) {
            const stat = await fs.stat(absoluteBase).catch(() => undefined);

            if (stat?.isFile()) {
                paths.add(pattern);
            }

            continue;
        }

        // No stat per file: live profiles change while being walked.
        const entries = await fs.readdir(absoluteBase, { recursive: true, withFileTypes: true }).catch(() => []);

        for (const entry of entries) {
            if (entry.isFile()) {
                paths.add(relative(HOME_DIR, join(entry.parentPath, entry.name)));
            }
        }
    }

    return [...paths];
}

/** Resolves the manifest against the takeout root and, for `root: 'home'` sources, the home directory. */
export async function resolveCorpusFromTakeout(): Promise<CorpusFile[]> {
    const takeoutPaths = (await walkFiles(TAKEOUT_DIR)).map((f) => f.path);
    const files: CorpusFile[] = [];

    for (const source of corpusSources) {
        const candidates = source.root === 'home' ? await listHomeCandidates(source) : takeoutPaths;
        files.push(...matchSource(source, candidates));
    }

    return files;
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

    // The importer comes from the manifest, not the index: a source can move to another importer (Spotify moved from
    // the script blueprint to the spotify module) without re-syncing the corpus.
    const importerBySource = new Map(corpusSources.map((source) => [source.id, source.importer]));
    files = files.flatMap((file) => {
        const importer = importerBySource.get(file.sourceId);

        return importer ? [{ ...file, importer }] : [];
    });

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
