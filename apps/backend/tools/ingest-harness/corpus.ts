/**
 * Ingest corpus CLI. Copies the export files named in `corpus.manifest.ts` out of the (read-only) takeout
 * folder into `temp/ingest-corpus/`, and inventories what the takeout holds that no importer reads yet.
 *
 *   pnpm ingest:corpus sync        copy manifest files into the corpus (skips unchanged files)
 *   pnpm ingest:corpus list        show which takeout files map to which importer, without copying
 *   pnpm ingest:corpus inventory   write temp/ingest-harness/inventory.md: covered vs uncovered export areas
 */
import fs from 'node:fs/promises';
import { constants as fsConstants, createReadStream, createWriteStream } from 'node:fs';
import { dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';
import micromatch from 'micromatch';
import { corpusSources, knownUnsupported } from './corpus.manifest.js';
import {
    CORPUS_DIR,
    REPORT_DIR,
    TAKEOUT_DIR,
    matchSource,
    resolveCorpusFromTakeout,
    walkFiles,
    type CorpusFile,
} from './lib/corpus.js';

const formatBytes = (bytes: number): string => {
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = bytes;
    let unit = 0;

    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit++;
    }

    return `${value.toFixed(unit ? 1 : 0)} ${units[unit]}`;
};

async function copyIntoCorpus(file: CorpusFile): Promise<'copied' | 'unchanged'> {
    const source = join(TAKEOUT_DIR, file.takeoutPath);
    const target = join(CORPUS_DIR, file.importPath);
    const sourceStat = await fs.stat(source);
    const targetStat = await fs.stat(target).catch(() => undefined);

    if (targetStat && !file.gunzip && targetStat.size === sourceStat.size && targetStat.mtimeMs >= sourceStat.mtimeMs) {
        return 'unchanged';
    }

    await fs.mkdir(dirname(target), { recursive: true });

    if (file.gunzip) {
        await pipeline(createReadStream(source), createGunzip(), createWriteStream(target));
    } else {
        // COPYFILE_FICLONE makes a cheap reflink where the filesystem supports it, a plain copy otherwise.
        await fs.copyFile(source, target, fsConstants.COPYFILE_FICLONE);
    }

    return 'copied';
}

async function sync(): Promise<void> {
    const files = await resolveCorpusFromTakeout();

    if (!files.length) {
        throw new Error(`No manifest file found under ${TAKEOUT_DIR}`);
    }

    await fs.mkdir(CORPUS_DIR, { recursive: true });

    let copied = 0;

    for (const file of files) {
        // Re-syncing over a read-only copy needs write permission back first.
        await fs.chmod(join(CORPUS_DIR, file.importPath), 0o644).catch(() => undefined);
        const result = await copyIntoCorpus(file);
        // The corpus copy is read-only: the harness copies again into the import folder (the trigger moves
        // files away after import), so nothing should ever edit these.
        await fs.chmod(join(CORPUS_DIR, file.importPath), 0o444);
        copied += result === 'copied' ? 1 : 0;
        console.log(`${result.padEnd(9)} ${file.sourceId.padEnd(28)} ${file.importPath}`);
    }

    for (const source of corpusSources) {
        if (!files.some((f) => f.sourceId === source.id)) {
            console.warn(`warning: source ${source.id} matched no file under ${TAKEOUT_DIR}`);
        }
    }

    await fs.writeFile(join(CORPUS_DIR, 'index.json'), JSON.stringify(files, null, 4));
    console.log(`\n${files.length} corpus files (${copied} copied) in ${CORPUS_DIR}`);
}

async function list(): Promise<void> {
    for (const file of await resolveCorpusFromTakeout()) {
        console.log(`${file.importer.padEnd(34)} ${file.takeoutPath}\n${' '.repeat(34)} -> ${file.importPath}`);
    }
}

async function inventory(): Promise<void> {
    const takeoutFiles = await walkFiles(TAKEOUT_DIR);
    const paths = takeoutFiles.map((f) => f.path);
    const sizeOf = new Map(takeoutFiles.map((f) => [f.path, f.size]));
    const covered = new Map<string, string>();

    for (const source of corpusSources) {
        for (const file of matchSource(source, paths)) {
            covered.set(file.takeoutPath, source.id);
        }
    }

    const areaRows = new Map<string, { notes: string; count: number; size: number; extensions: Map<string, number> }>();
    const unclassified: string[] = [];

    for (const path of paths) {
        if (covered.has(path)) {
            continue;
        }

        // First matching area wins, so the manifest lists specific areas before catch-alls.
        const area = knownUnsupported.find((a) => micromatch.isMatch(path, a.glob, { dot: false }));

        if (!area) {
            unclassified.push(path);
            continue;
        }

        const row = areaRows.get(area.area) ?? { notes: area.notes, count: 0, size: 0, extensions: new Map() };
        const extension = path.includes('.') ? path.slice(path.lastIndexOf('.') + 1).toLowerCase() : '(none)';
        row.count++;
        row.size += sizeOf.get(path) ?? 0;
        row.extensions.set(extension, (row.extensions.get(extension) ?? 0) + 1);
        areaRows.set(area.area, row);
    }

    const lines = [
        `# Takeout inventory`,
        '',
        `Root: \`${TAKEOUT_DIR}\` — ${paths.length} files, generated ${new Date().toISOString()}.`,
        '',
        '## Covered by an importer',
        '',
        '| Source | Importer | Files | Size |',
        '| --- | --- | ---: | ---: |',
        ...corpusSources.map((source) => {
            const files = [...covered.entries()].filter(([, id]) => id === source.id).map(([p]) => p);
            const size = files.reduce((sum, p) => sum + (sizeOf.get(p) ?? 0), 0);
            return `| ${source.id} | ${source.importer} | ${files.length} | ${formatBytes(size)} |`;
        }),
        '',
        '## Not imported yet',
        '',
        '| Area | Files | Size | Extensions | Notes |',
        '| --- | ---: | ---: | --- | --- |',
        ...[...areaRows.entries()]
            .sort(([, a], [, b]) => b.size - a.size)
            .map(([area, row]) => {
                const extensions = [...row.extensions.entries()]
                    .sort(([, a], [, b]) => b - a)
                    .slice(0, 4)
                    .map(([ext, count]) => `${ext}:${count}`)
                    .join(' ');
                return `| ${area} | ${row.count} | ${formatBytes(row.size)} | ${extensions} | ${row.notes} |`;
            }),
        '',
        `## Unclassified (${unclassified.length})`,
        '',
        ...unclassified.slice(0, 100).map((p) => `- \`${p}\` (${formatBytes(sizeOf.get(p) ?? 0)})`),
        '',
    ];

    await fs.mkdir(REPORT_DIR, { recursive: true });
    const target = join(REPORT_DIR, 'inventory.md');
    await fs.writeFile(target, lines.join('\n'));
    console.log(lines.join('\n'));
    console.log(`\nWritten to ${target}`);
}

const command = process.argv[2];
const commands: Record<string, () => Promise<void>> = { sync, list, inventory };

if (!command || !commands[command]) {
    console.error(`Usage: corpus.ts <${Object.keys(commands).join('|')}>`);
    process.exit(1);
}

await commands[command]();
