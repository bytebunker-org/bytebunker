import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { AssetTypeEnum } from './type/asset-type.enum.js';
import type { AssetStorageService } from './asset-storage.service.js';
import {
    PIPELINE_ASSET_STORAGE_TOKEN,
    PRIMARY_ASSET_STORAGE_TOKEN,
    SIDECAR_ASSET_STORAGE_TOKEN,
} from './asset.constant.js';
import { enumValues } from '../../util/util.js';
import type { CreateAssetDto } from './dto/create-asset.dto.js';
import type { AssetDto } from './dto/asset.dto.js';
import { blake3 } from 'hash-wasm';
import { parse, type ParsedPath } from 'node:path';
import type { EntityManager } from '@mikro-orm/postgresql';
import { AssetEntity } from './entity/asset.entity.js';
import { v7 as uuidV7 } from 'uuid';
import fs from 'node:fs/promises';
import mmmagic from 'mmmagic';
import type { Readable } from 'node:stream';
import { NotFoundError } from '../../util/rest-error.js';

const DEFAULT_MIME_TYPE = 'application/octet-stream';

export interface RegisterExternalAssetOptions {
    type?: AssetTypeEnum;
    size?: number | null;
    metadata?: Record<string, unknown>;
}

@Injectable()
export class AssetService implements OnApplicationBootstrap {
    private readonly logger = new Logger(AssetService.name);
    private readonly magic = new mmmagic.Magic(mmmagic.MAGIC_MIME_TYPE);

    constructor(
        @Inject(PRIMARY_ASSET_STORAGE_TOKEN) private readonly primaryAssetStorageService: AssetStorageService,
        @Inject(SIDECAR_ASSET_STORAGE_TOKEN) private readonly sidecarAssetStorageService: AssetStorageService,
        @Inject(PIPELINE_ASSET_STORAGE_TOKEN) private readonly pipelineAssetStorageService: AssetStorageService,
    ) {}

    public async onApplicationBootstrap(): Promise<void> {
        for (const type of enumValues(AssetTypeEnum)) {
            await this.getStorageService(type).initStorage(type);
        }
    }

    public async storeAssetFromLocalFile(
        em: EntityManager,
        filePath: string,
        options: CreateAssetDto,
    ): Promise<AssetDto> {
        const fileContents = await fs.readFile(filePath);

        return this.storeAsset(em, fileContents, {
            ...options,
            fullOriginalFilePath: filePath,
        });
    }

    public async storeAsset(
        em: EntityManager,
        data: string | Buffer,
        options: CreateAssetDto & { fullOriginalFilePath?: string },
    ): Promise<AssetDto> {
        const id = uuidV7();
        const hash = await blake3(data);
        const hashBuffer = Buffer.from(hash, 'hex');

        const parsedOriginalPath = options.originalFilePath ? parse(options.originalFilePath) : null;
        const storagePath = this.buildStoragePath(id, parsedOriginalPath ?? undefined);

        const existingAsset = await em.findOne(AssetEntity, {
            type: options.type,
            hash: hashBuffer,
        });

        if (existingAsset) {
            this.logger.log(`Asset ${options.originalFilePath ?? id} already exists with id ${existingAsset.id}`);

            return this.enrich(existingAsset);
        }

        let mimeType: string | undefined;
        if (options.metadata?.['Content-Type']) {
            mimeType = options.metadata['Content-Type'];
        } else if (options.fullOriginalFilePath) {
            try {
                mimeType = await this.detectLocalFileMimeType(options.fullOriginalFilePath);
            } catch {
                this.logger.warn(`Failed to detect mimetype for asset ${id}`);
            }
        } else {
            try {
                mimeType = await this.detectMimeType(data);
            } catch {
                this.logger.warn(`Failed to detect mimetype for asset ${id}`);
            }
        }

        const resolvedMimeType = mimeType ?? DEFAULT_MIME_TYPE;
        const originalFilename = parsedOriginalPath?.base ?? id;
        const size = options.size ?? Buffer.byteLength(data);

        const mergedMetadata = {
            ...options.metadata,
            'Content-Type': resolvedMimeType,
            ...(options.originalFilePath ? { 'Original-File-Path': options.originalFilePath } : undefined),
        };

        const asset = em.create(AssetEntity, {
            id,
            type: options.type,
            hash: hashBuffer,
            originalFilename,
            mimeType: resolvedMimeType,
            size,
            storagePath,
            textAssetPreview: typeof data === 'string' ? data.slice(0, 512) : undefined,
            metadata: mergedMetadata,
        });
        await em.flush();

        await this.getStorageService(options.type).storeAsset(storagePath, data, size, mergedMetadata);

        this.logger.log(`Created new asset ${storagePath}`);

        return this.enrich(asset);
    }

    public async registerExternalAsset(
        em: EntityManager,
        url: string,
        originalFilename: string,
        mimeType: string,
        options: RegisterExternalAssetOptions = {},
    ): Promise<AssetDto> {
        const id = uuidV7();
        const type = options.type ?? AssetTypeEnum.PRIMARY;
        const hashSource = `external:${url}`;
        const hashBuffer = Buffer.from(await blake3(hashSource), 'hex');

        const existingAsset = await em.findOne(AssetEntity, { type, hash: hashBuffer });
        if (existingAsset) {
            return this.enrich(existingAsset);
        }

        const asset = em.create(AssetEntity, {
            id,
            type,
            hash: hashBuffer,
            originalFilename,
            mimeType,
            size: options.size ?? null,
            storagePath: null,
            externalUrl: url,
            metadata: {
                ...options.metadata,
                'Content-Type': mimeType,
            },
        });
        await em.flush();

        return this.enrich(asset);
    }

    public async findById(em: EntityManager, id: string): Promise<AssetDto> {
        const asset = await em.findOne(AssetEntity, { id });
        if (!asset) {
            throw new NotFoundError(`Asset ${id} not found`);
        }

        return this.enrich(asset);
    }

    public async delete(em: EntityManager, id: string): Promise<void> {
        const asset = await em.findOne(AssetEntity, { id });
        if (!asset) {
            return;
        }

        if (!this.isExternal(asset) && asset.storagePath) {
            await this.getStorageService(asset.type).deleteAsset(asset.storagePath);
        }

        await em.removeAndFlush(asset);
    }

    public isExternal(asset: AssetDto | AssetEntity): boolean {
        return Boolean(asset.externalUrl);
    }

    public buildPublicUrl(asset: AssetDto | AssetEntity): string {
        if (asset.externalUrl) {
            return asset.externalUrl;
        }
        if (!asset.storagePath) {
            throw new Error(`Asset ${asset.id} has neither storagePath nor externalUrl`);
        }
        return this.getStorageService(asset.type).getPublicUrl(asset.storagePath);
    }

    public async getAssetStream(em: EntityManager, assetOrId: AssetDto | string): Promise<Readable> {
        const asset = typeof assetOrId === 'string' ? await em.findOneOrFail(AssetEntity, assetOrId) : assetOrId;

        if (this.isExternal(asset)) {
            throw new Error(`getAssetStream not supported for external asset ${asset.id}`);
        }

        return this.getStorageService(asset.type).retrieveAssetStream(asset.storagePath!);
    }

    public async getAsset(
        em: EntityManager,
        assetOrId: AssetDto | string,
        encoding: BufferEncoding = 'utf8',
    ): Promise<Buffer> {
        const asset = typeof assetOrId === 'string' ? await em.findOneOrFail(AssetEntity, assetOrId) : assetOrId;

        if (this.isExternal(asset)) {
            throw new Error(`getAsset not supported for external asset ${asset.id}`);
        }

        return this.getStorageService(asset.type).retrieveAsset(asset.storagePath!, encoding);
    }

    public async getAssetString(
        em: EntityManager,
        assetOrId: AssetDto | string,
        encoding: BufferEncoding = 'utf8',
    ): Promise<string> {
        const asset = typeof assetOrId === 'string' ? await em.findOneOrFail(AssetEntity, assetOrId) : assetOrId;

        if (this.isExternal(asset)) {
            throw new Error(`getAssetString not supported for external asset ${asset.id}`);
        }

        return this.getStorageService(asset.type).retrieveAssetString(asset.storagePath!, encoding);
    }

    private enrich<T extends AssetEntity>(asset: T): T {
        asset.publicUrl = this.buildPublicUrl(asset);
        return asset;
    }

    private buildStoragePath(id: string, parsedOriginalPath: ParsedPath | undefined): string {
        const fileName = parsedOriginalPath?.base;

        return fileName ? `${id}/${fileName}` : id;
    }

    private detectMimeType(data: string | Buffer): Promise<string> {
        return new Promise((resolve, reject) => {
            const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf-8');

            return this.magic.detect(buffer, (err, result) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(result as string);
                }
            });
        });
    }

    private detectLocalFileMimeType(filePath: string): Promise<string> {
        return new Promise((resolve, reject) => {
            return this.magic.detectFile(filePath, (err, result) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(result as string);
                }
            });
        });
    }

    private getStorageService(type: AssetTypeEnum): AssetStorageService {
        switch (type) {
            case AssetTypeEnum.PRIMARY:
                return this.primaryAssetStorageService;
            case AssetTypeEnum.SIDECAR:
                return this.sidecarAssetStorageService;
            case AssetTypeEnum.PIPELINE:
                return this.pipelineAssetStorageService;
            default:
                throw new Error(`Unknown asset type: ${type}`);
        }
    }
}
