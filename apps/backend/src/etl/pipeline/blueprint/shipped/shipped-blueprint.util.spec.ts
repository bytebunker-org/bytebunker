import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
    canonicalJson,
    decideShippedBlueprintAction,
    hashBlueprintData,
    loadShippedBlueprints,
} from './shipped-blueprint.util.js';

describe('hashBlueprintData', () => {
    it('ignores key order', () => {
        expect(hashBlueprintData({ a: 1, b: { c: [1, 2], d: 3 } })).toBe(
            hashBlueprintData({ b: { d: 3, c: [1, 2] }, a: 1 }),
        );
    });

    it('differs when content differs', () => {
        expect(hashBlueprintData({ a: 1 })).not.toBe(hashBlueprintData({ a: 2 }));
        expect(canonicalJson({ a: undefined })).toBe('{}');
    });
});

describe('decideShippedBlueprintAction', () => {
    const v1 = { nodes: [{ id: 1 }] };
    const v2 = { nodes: [{ id: 1 }, { id: 2 }] };
    const h1 = hashBlueprintData(v1);
    const h2 = hashBlueprintData(v2);

    it('installs when missing', () => {
        expect(decideShippedBlueprintAction(undefined, h1)).toBe('install');
    });

    it('does nothing when up to date', () => {
        expect(decideShippedBlueprintAction({ data: v1, shippedHash: h1 }, h1)).toBe('unchanged');
    });

    it('updates an untouched older version', () => {
        expect(decideShippedBlueprintAction({ data: v1, shippedHash: h1 }, h2)).toBe('update');
    });

    it('leaves user edited blueprints alone', () => {
        expect(decideShippedBlueprintAction({ data: { nodes: [] }, shippedHash: h1 }, h2)).toBe('user-modified');
    });

    it('adopts the hash when the stored data already matches', () => {
        expect(decideShippedBlueprintAction({ data: v2, shippedHash: h1 }, h2)).toBe('adopt-hash');
    });
});

describe('loadShippedBlueprints', () => {
    let dir: string | undefined;

    afterEach(async () => {
        if (dir) await rm(dir, { recursive: true, force: true });
    });

    it('derives keys from folder and file name and reports broken files', async () => {
        dir = await mkdtemp(path.join(tmpdir(), 'shipped-bp-'));
        await mkdir(path.join(dir, 'google', 'blueprints'), { recursive: true });
        await mkdir(path.join(dir, 'other'), { recursive: true });
        await writeFile(
            path.join(dir, 'google', 'blueprints', 'timeline.blueprint.json'),
            JSON.stringify({ title: 'T', data: { nodes: [], edges: [] } }),
        );
        await writeFile(path.join(dir, 'google', 'blueprints', 'broken.blueprint.json'), '{ nope');

        const errors: string[] = [];
        const result = await loadShippedBlueprints(dir, (file) => errors.push(file));

        expect(result.map((b) => b.key)).toEqual(['google/timeline']);
        expect(errors).toHaveLength(1);
    });

    it('finds the blueprints shipped in the repository', async () => {
        const errors: string[] = [];
        const result = await loadShippedBlueprints(
            path.resolve(import.meta.dirname, '../../../../extension/extensions'),
            (f) => errors.push(f),
        );

        expect(errors).toEqual([]);
        expect(result.map((b) => b.key)).toEqual(
            expect.arrayContaining(['google/timeline', 'youtube/watch-history', 'ics-calendar/calendar']),
        );
    });
});
