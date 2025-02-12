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

    public abstract retrieveAssetStream(storagePath: string): Promise<Readable>;

    public abstract retrieveAsset(storagePath: string, encoding?: BufferEncoding): Promise<Buffer>;

    public abstract retrieveAssetString(storagePath: string, encoding?: BufferEncoding): Promise<string>;
}
