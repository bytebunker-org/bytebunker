import { describe, expect, it, vi } from 'vitest';
import type { EntityManager } from '@mikro-orm/postgresql';
import type { AssetService } from '../../asset/asset.service.js';
import {
    INLINE_OUTPUT_MAX_BYTES,
    isExternalNodeOutputRef,
    PipelineOutputStoreService,
} from './pipeline-output-store.service.js';

function createStore() {
    const stored = new Map<string, Buffer>();
    const assetService = {
        storeAsset: vi.fn((_em: unknown, data: Buffer) => {
            const id = `asset-${stored.size + 1}`;
            stored.set(id, data);
            return Promise.resolve({ id });
        }),
        getAsset: vi.fn((_em: unknown, id: string) => Promise.resolve(stored.get(id)!)),
    } as unknown as AssetService;

    return { store: new PipelineOutputStoreService(assetService), assetService };
}

const em = {} as EntityManager;

describe('PipelineOutputStoreService', () => {
    it('keeps small handles inline', async () => {
        const { store, assetService } = createStore();
        const output = { activities: [{ a: 1 }], createdCount: 3 };

        expect(await store.externalize(em, 1, 2, output)).toEqual(output);
        expect(assetService.storeAsset).not.toHaveBeenCalled();
    });

    it('stores large handles as assets and resolves them back', async () => {
        const { store } = createStore();
        const activities = Array.from({ length: 60_000 }, (_, i) => ({ id: i, text: 'x'.repeat(80) }));
        const output = (await store.externalize(em, 1, 2, { activities, skipped: { total: 0 } })) as Record<
            string,
            unknown
        >;

        expect(JSON.stringify(activities).length).toBeGreaterThan(INLINE_OUTPUT_MAX_BYTES);
        expect(isExternalNodeOutputRef(output['activities'])).toBe(true);
        expect(output['activities']).toMatchObject({ items: 60_000 });
        expect(output['skipped']).toEqual({ total: 0 });
        expect(await store.resolve(em, output['activities'])).toEqual(activities);
    });

    it('passes non-reference values through resolve', async () => {
        const { store } = createStore();

        expect(await store.resolve(em, [1, 2])).toEqual([1, 2]);
        expect(await store.resolve(em, undefined)).toBeUndefined();
    });
});
