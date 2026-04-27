import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Client, S3Error } from 'minio';
import { MINIO_CLIENT_PROVIDER } from './asset.constant.js';
import { AssetConfig } from '../../util/config/asset.config.js';
import { AssetTypeEnum } from './type/asset-type.enum.js';
import { AssetStorageService } from './asset-storage.service.js';
import type { Readable } from 'node:stream';
import type { CommonMetadata } from './common-metadata.interface.js';

@Injectable()
export class S3AssetStorageService extends AssetStorageService {
    private readonly logger = new Logger(S3AssetStorageService.name);
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

        await this.minioClient.setBucketPolicy(
            this.bucketName,
            JSON.stringify({
                Version: '2012-10-17',
                Statement: [
                    {
                        Effect: 'Allow',
                        Principal: { AWS: ['*'] },
                        Action: ['s3:GetObject'],
                        Resource: [`arn:aws:s3:::${this.bucketName}/*`],
                    },
                ],
            }),
        );
    }

    public override async storeAsset(
        storagePath: string,
        data: Readable | Buffer | string,
        size?: number,
        metadata?: CommonMetadata & Record<string, unknown>,
    ): Promise<void> {
        await this.minioClient.putObject(this.bucketName, storagePath, data, size, metadata);
    }

    public override retrieveAssetStream(storagePath: string): Promise<Readable> {
        return this.minioClient.getObject(this.bucketName, storagePath);
    }

    public override async retrieveAsset(storagePath: string, encoding: BufferEncoding = 'utf8'): Promise<Buffer> {
        const readableStream = await this.retrieveAssetStream(storagePath);

        return this.streamToBuffer(readableStream, encoding);
    }

    public override async retrieveAssetString(storagePath: string, encoding: BufferEncoding = 'utf8'): Promise<string> {
        const assetBuffer = await this.retrieveAsset(storagePath, encoding);

        return assetBuffer.toString(encoding);
    }

    public override async deleteAsset(storagePath: string): Promise<void> {
        try {
            await this.minioClient.removeObject(this.bucketName, storagePath);
        } catch (error) {
            this.logger.warn(`Failed to delete asset ${this.bucketName}/${storagePath}: ${(error as Error).message}`);
        }
    }

    public override async assetExists(storagePath: string): Promise<boolean> {
        try {
            await this.minioClient.statObject(this.bucketName, storagePath);
            return true;
        } catch (error) {
            if (error instanceof S3Error && error.code === 'NotFound') {
                return false;
            }
            throw error;
        }
    }

    public override getPublicUrl(storagePath: string): string {
        const base = this.assetConfig.publicBaseUrl.replace(/\/+$/, '');
        const encodedPath = storagePath.split('/').map(encodeURIComponent).join('/');

        return `${base}/${this.bucketName}/${encodedPath}`;
    }

    private streamToBuffer(readableStream: Readable, encoding?: BufferEncoding): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            const chunks: Buffer[] = [];

            readableStream.on('data', (data) => {
                if (typeof data === 'string') {
                    chunks.push(Buffer.from(data, encoding));
                } else if (data instanceof Buffer) {
                    chunks.push(data);
                } else {
                    const jsonData = JSON.stringify(data);
                    chunks.push(Buffer.from(jsonData, encoding));
                }
            });

            readableStream.on('end', () => {
                resolve(Buffer.concat(chunks));
            });

            readableStream.on('error', reject);
        });
    }
}
