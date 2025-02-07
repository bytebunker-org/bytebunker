import { Inject, Injectable } from '@nestjs/common';
import type { Client } from 'minio';
import { MINIO_CLIENT_PROVIDER } from './asset.constant.js';
import { AssetConfig } from '../../util/config/asset.config.js';
import { AssetTypeEnum } from './type/asset-type.enum.js';
import { AssetStorageService } from './asset-storage.service.js';
import type { Readable } from 'node:stream';
import type { CommonMetadata } from './common-metadata.interface.js';

@Injectable()
export class S3AssetStorageService extends AssetStorageService {
    private assetType!: AssetTypeEnum;
    private bucketName!: string;

    constructor(
        private readonly assetConfig: AssetConfig,
        @Inject(MINIO_CLIENT_PROVIDER) private readonly minioClient: Client,
    ) {
        super();
    }

    public override async initStorage(assetType: AssetTypeEnum): Promise<void> {
        this.assetType = assetType;
        this.bucketName = `${assetType}-assets`;

        if (!(await this.minioClient.bucketExists(this.bucketName))) {
            await this.minioClient.makeBucket(this.bucketName, this.assetConfig.region);
        }
    }

    public override async storeAsset(
        storagePath: string,
        data: Readable | Buffer | string,
        size?: number,
        metadata?: CommonMetadata & Record<string, unknown>,
    ): Promise<void> {
        await this.minioClient!.putObject(this.bucketName, storagePath, data, size, metadata);
    }
}
