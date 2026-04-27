import { Module } from '@nestjs/common';
import { S3AssetStorageService } from './s3-asset-storage.service.js';
import { AssetService } from './asset.service.js';
import { AssetController } from './asset.controller.js';
import { minioClientProvider } from './minio-client.provider.js';
import { ASSET_STORAGE_SERVICE_INJECTION_TOKENS } from './asset.constant.js';
import { provideServiceAlternatives } from '../../shared/service-alternatives/service-alternative.util.js';
import { AssetStorageService } from './asset-storage.service.js';

const { providers: storageProviders, exports: storageExports } = provideServiceAlternatives({
    abstractServiceClass: AssetStorageService,
    injectionTokens: ASSET_STORAGE_SERVICE_INJECTION_TOKENS,
    providers: [S3AssetStorageService],
});

@Module({
    controllers: [AssetController],
    providers: [...storageProviders, AssetService, minioClientProvider],
    exports: [...storageExports, AssetService],
})
export class AssetModule {}
