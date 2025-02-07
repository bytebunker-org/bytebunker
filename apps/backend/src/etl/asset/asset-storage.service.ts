import type { AssetTypeEnum } from './type/asset-type.enum.js';
import type { Readable } from 'node:stream';
import type { CommonMetadata } from './common-metadata.interface.js';

export abstract class AssetStorageService {
    public abstract initStorage(assetType: AssetTypeEnum): void | Promise<void>;

    public abstract storeAsset(
        storagePath: string,
        data: Readable | Buffer | string,
        size?: number,
        metadata?: CommonMetadata & Record<string, unknown>,
    ): Promise<void>;
}
