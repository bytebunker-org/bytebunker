import { createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import { dirname, join, normalize, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import yauzl from 'yauzl';

/**
 * Extracts a zip archive into `targetDir` and returns the relative paths of the extracted files. Streams entry by
 * entry, so whole takeout archives work without holding them in memory. Entries escaping the target directory
 * (zip slip) are refused.
 */
export async function extractZip(
    zipPath: string,
    targetDir: string,
    shouldExtract: (relativePath: string) => boolean = () => true,
): Promise<{ extracted: string[]; skipped: string[] }> {
    const zip = await new Promise<yauzl.ZipFile>((resolve, reject) =>
        yauzl.open(zipPath, { lazyEntries: true, autoClose: true }, (error, file) =>
            error ? reject(error) : resolve(file),
        ),
    );
    const extracted: string[] = [];
    const skipped: string[] = [];

    await new Promise<void>((resolve, reject) => {
        zip.on('error', reject);
        zip.on('end', () => resolve());
        zip.on('entry', (entry: yauzl.Entry) => {
            void (async () => {
                const relativePath = entry.fileName.replaceAll('\\', '/');

                if (relativePath.endsWith('/')) {
                    zip.readEntry();
                    return;
                }

                const target = normalize(join(targetDir, relativePath));

                if (!target.startsWith(normalize(targetDir) + sep)) {
                    throw new Error(`Zip entry ${relativePath} points outside the archive`);
                }

                if (!shouldExtract(relativePath)) {
                    skipped.push(relativePath);
                    zip.readEntry();
                    return;
                }

                await fs.mkdir(dirname(target), { recursive: true });
                const stream = await new Promise<NodeJS.ReadableStream>((res, rej) =>
                    zip.openReadStream(entry, (error, readStream) => (error ? rej(error) : res(readStream))),
                );
                await pipeline(stream, createWriteStream(target));
                extracted.push(relativePath);
                zip.readEntry();
            })().catch(reject);
        });
        zip.readEntry();
    });

    return { extracted, skipped };
}
