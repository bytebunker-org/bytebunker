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

@Injectable()
export class AssetService implements OnApplicationBootstrap {
    private readonly logger = new Logger(AssetService.name);
    private readonly assetStorageServiceMap = new Map<AssetTypeEnum, AssetStorageService>();
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

        console.log('hashing asset', options, 'to', hash);
        const parsedOriginalPath = options.originalFilePath ? parse(options.originalFilePath) : null;
        const storagePath = this.buildStoragePath(id, parsedOriginalPath ?? undefined, options);

        const existingAsset = await em.findOne(AssetEntity, {
            hash: hashBuffer,
        });

        if (existingAsset) {
            this.logger.log(`Asset ${options.originalFilePath} already exists with id ${existingAsset.id}`);

            return existingAsset;
        }

        let mimeType: string | undefined;
        if (options.metadata?.['Content-Type']) {
            mimeType = options.metadata?.['Content-Type'];
        } else if (options.fullOriginalFilePath) {
            try {
                mimeType = await this.detectLocalFileMimeType(options.fullOriginalFilePath);
            } catch (error) {
                this.logger.warn(`Failed to detect mimetype for asset ${id}`);
            }
        } else {
            try {
                mimeType = await this.detectMimeType(data);
            } catch (error) {
                this.logger.warn(`Failed to detect mimetype for asset ${id}`);
            }
        }

        options.metadata = {
            ...options.metadata,
            ...(mimeType ? { 'Content-Type': mimeType } : undefined),
            ...(options.originalFilePath ? { 'Original-File-Path': options.originalFilePath } : undefined),
        };

        const asset = em.create(AssetEntity, {
            id,
            type: options.type,
            hash: hashBuffer,
            storagePath,
            metadata: options.metadata,
        });
        await em.flush();

        await this.getStorageService(options.type).storeAsset(storagePath, data, options.size, options.metadata);

        this.logger.log(`Created new asset ${storagePath}`);

        return asset;
    }

    private buildStoragePath(id: string, parsedOriginalPath: ParsedPath | undefined, options: CreateAssetDto): string {
        const fileName = parsedOriginalPath?.base;

        // TODO: As a fallback, get file extension from detected mimetype?
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
