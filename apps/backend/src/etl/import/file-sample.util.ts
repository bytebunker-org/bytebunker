import fs from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { FILE_SAMPLE_HEAD_BYTES, type FileSample } from './type/file-detection.interface.js';

/** Reads just enough of a file for importers to recognise it (see `IPipelineModule.detectFile`). */
export async function buildFileSample(absolutePath: string, relativePath: string): Promise<FileSample> {
    const handle = await fs.open(absolutePath, 'r');

    try {
        const { size } = await handle.stat();
        const buffer = Buffer.alloc(Math.min(size, FILE_SAMPLE_HEAD_BYTES));
        await handle.read(buffer, 0, buffer.length, 0);
        const fileName = basename(relativePath);

        return {
            relativePath: relativePath.replaceAll('\\', '/'),
            fileName,
            extension: extname(fileName).slice(1).toLowerCase(),
            size,
            head: buffer.toString('utf8'),
        };
    } finally {
        await handle.close();
    }
}

/** Files the import never looks into: media and OS metadata. Keeps a whole-takeout zip fast. */
const IGNORED_EXTENSIONS = new Set([
    'jpg',
    'jpeg',
    'png',
    'gif',
    'heic',
    'webp',
    'mp4',
    'mov',
    'mp3',
    'm4a',
    'wav',
    'avi',
    'mkv',
    'pdf',
]);

export function isIgnoredImportPath(relativePath: string): boolean {
    const fileName = basename(relativePath);
    const extension = extname(fileName).slice(1).toLowerCase();

    return (
        relativePath.split('/').some((part) => part === '__MACOSX' || part.startsWith('.')) ||
        fileName === 'Thumbs.db' ||
        IGNORED_EXTENSIONS.has(extension)
    );
}
