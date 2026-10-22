import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EntityManager } from '@mikro-orm/postgresql';
import { AssetService } from './asset.service.js';
import type { AssetStorageService } from './asset-storage.service.js';
import { AssetTypeEnum } from './type/asset-type.enum.js';
import type { AssetEntity } from './entity/asset.entity.js';

function storageMock() {
    return {
        assetExists: vi.fn(() => Promise.resolve(true)),
        storeAsset: vi.fn(() => Promise.resolve()),
        getPublicUrl: vi.fn((path: string) => `http://storage/${path}`),
    };
}

describe('AssetService.storeAsset dedup', () => {
    let service: AssetService;
    let pipelineStorage: ReturnType<typeof storageMock>;
    let existing: AssetEntity;
    let em: { findOne: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn>; flush: ReturnType<typeof vi.fn> };

    beforeEach(() => {
        pipelineStorage = storageMock();
        service = new AssetService(
            storageMock() as unknown as AssetStorageService,
            storageMock() as unknown as AssetStorageService,
            pipelineStorage as unknown as AssetStorageService,
        );
        existing = {
            id: 'existing-id',
            type: AssetTypeEnum.PIPELINE,
            storagePath: 'existing-id/calendar.ics',
            metadata: { 'Content-Type': 'text/calendar', 'Original-File-Path': 'calendar.ics' },
        } as unknown as AssetEntity;
        em = { findOne: vi.fn(() => Promise.resolve(existing)), create: vi.fn(), flush: vi.fn() };
    });

    function store() {
        return service.storeAsset(em as unknown as EntityManager, 'BEGIN:VCALENDAR', {
            type: AssetTypeEnum.PIPELINE,
            originalFilePath: 'other/calendar.ics',
            metadata: {},
        });
    }

    it('reuses the existing row without uploading when the object is in storage', async () => {
        const asset = await store();

        expect(asset.id).toBe('existing-id');
        expect(pipelineStorage.assetExists).toHaveBeenCalledWith('existing-id/calendar.ics');
        expect(pipelineStorage.storeAsset).not.toHaveBeenCalled();
        expect(em.create).not.toHaveBeenCalled();
    });

    it('uploads the content to the existing row path when the object is missing', async () => {
        pipelineStorage.assetExists.mockResolvedValue(false);

        const asset = await store();

        expect(asset.id).toBe('existing-id');
        expect(pipelineStorage.storeAsset).toHaveBeenCalledExactlyOnceWith(
            'existing-id/calendar.ics',
            'BEGIN:VCALENDAR',
            15,
            existing.metadata,
        );
        expect(em.create).not.toHaveBeenCalled();
    });

    it('never checks storage for external assets', async () => {
        existing = { ...existing, storagePath: null, externalUrl: 'https://example.org/a.jpg' } as AssetEntity;

        await store();

        expect(pipelineStorage.assetExists).not.toHaveBeenCalled();
    });
});
