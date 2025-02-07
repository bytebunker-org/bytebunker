import { enumValues } from '../../util/util.js';
import { AssetTypeEnum } from './type/asset-type.enum.js';
import { toPascalCase } from 'js-convert-case';

export const MINIO_CLIENT_PROVIDER = 'MINIO_CLIENT_PROVIDER';

export const ASSET_STORAGE_SERVICE_INJECTION_TOKEN_MAP = Object.fromEntries(
    enumValues(AssetTypeEnum).map((type) => [type, `${toPascalCase(type)}AssetStorageProvider`]),
) as Record<AssetTypeEnum, string>;

export const ASSET_STORAGE_SERVICE_INJECTION_TOKENS = Object.values(ASSET_STORAGE_SERVICE_INJECTION_TOKEN_MAP);

const createAssetStorageToken = (type: AssetTypeEnum) => `${toPascalCase(type)}AssetStorageProvider`;

export const PRIMARY_ASSET_STORAGE_TOKEN = createAssetStorageToken(AssetTypeEnum.PRIMARY);
export const SIDECAR_ASSET_STORAGE_TOKEN = createAssetStorageToken(AssetTypeEnum.SIDECAR);
export const PIPELINE_ASSET_STORAGE_TOKEN = createAssetStorageToken(AssetTypeEnum.PIPELINE);
