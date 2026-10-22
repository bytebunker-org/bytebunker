import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/** Tier-1 ingest harness: real export files through the transform modules. See tools/ingest-harness/README.md. */
export default defineConfig({
    test: {
        globals: true,
        root: './',
        include: ['tools/ingest-harness/**/*.ingest.ts'],
        // Whole-file exports (60+ MB JSON) take a while; one file per test, run in order for the dedup prediction.
        testTimeout: 10 * 60 * 1000,
        hookTimeout: 60 * 1000,
        sequence: { concurrent: false },
        fileParallelism: false,
    },
    plugins: [
        // Only TypeScript needs SWC (decorator metadata); workspace libs ship JS with import attributes SWC rejects.
        // @ts-ignore
        swc.vite({ include: /\.[mc]?tsx?$/, module: { type: 'es6' } }),
    ],
});
