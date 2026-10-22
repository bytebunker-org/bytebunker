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
        await this.minioClient.putObject(this.bucketName, storagePath, data, size, toS3Metadata(metadata));
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
            // statObject is a HEAD request; depending on the server a missing key reports either code.
            if (error instanceof S3Error && (error.code === 'NotFound' || error.code === 'NoSuchKey')) {
                return false;
            }
            throw error;
        }
    }

    public override getPublicUrl(storagePath: string): string {
        const base = (this.assetConfig.publicBaseUrl ?? '').replace(/\/+$/, '');
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

/**
 * S3 user metadata travels as `x-amz-meta-*` HTTP headers, which only carry printable ASCII: a value like the
 * original path `Meine Aktivitäten/MeineAktivitäten.html` makes the request signature mismatch. Such values are
 * percent-encoded; the full metadata is kept on the asset row anyway.
 */
export function toS3Metadata(
    metadata: (CommonMetadata & Record<string, unknown>) | undefined,
): (CommonMetadata & Record<string, unknown>) | undefined {
    if (!metadata) {
        return undefined;
    }

    return Object.fromEntries(
        Object.entries(metadata).map(([key, value]) => [
            key,
            typeof value === 'string' && /[^\u0020-\u007E]/.test(value) ? encodeURIComponent(value) : value,
        ]),
    ) as CommonMetadata & Record<string, unknown>;
}
