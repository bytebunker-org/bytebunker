import type { Provider } from '@nestjs/common';
import { AssetConfig } from '../../util/config/asset.config.js';
import { MINIO_CLIENT_PROVIDER } from './asset.constant.js';
import { Client } from 'minio';

export const minioClientProvider: Provider = {
    provide: MINIO_CLIENT_PROVIDER,
    useFactory: (config: AssetConfig) => {
        return new Client({
            endPoint: config.endPoint,
            port: config.port,
            useSSL: config.useSSL,
            accessKey: config.accessKey,
            secretKey: config.secretKey,
        });
    },
    inject: [AssetConfig],
};
