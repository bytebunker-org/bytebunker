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

        return buildFileSampleFromHead(relativePath, size, buffer);
    } finally {
        await handle.close();
    }
}

/** Sample from a head read elsewhere, e.g. sent by the upload UI before the actual upload. */
export function buildFileSampleFromHead(relativePath: string, size: number, head: Buffer): FileSample {
    const fileName = basename(relativePath);

    return {
        relativePath: relativePath.replaceAll('\\', '/'),
        fileName,
        extension: extname(fileName).slice(1).toLowerCase(),
        size,
        head: head.subarray(0, FILE_SAMPLE_HEAD_BYTES).toString('utf8'),
    };
}
