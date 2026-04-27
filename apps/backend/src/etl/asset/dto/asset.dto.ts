import { TimestampDto } from '../../../database/util/timestamp.dto.js';
import { PrimaryKeyProp } from '@mikro-orm/core';
import { Allow, IsBoolean, IsEnum, IsInt, IsObject, IsOptional, IsString, IsUUID, IsUrl } from 'class-validator';
import { AssetTypeEnum } from '../type/asset-type.enum.js';
import type { CommonMetadata } from '../common-metadata.interface.js';
import { Required, Enum, Type as SType, Optional } from 'ts-decorator-json-schema-generator';

export class AssetDto extends TimestampDto {
    [PrimaryKeyProp]?: 'id';

    @IsUUID()
    @Required()
    public id!: string;

    @IsEnum(AssetTypeEnum)
    @Required()
    @Enum(AssetTypeEnum)
    public type!: AssetTypeEnum;

    @Allow()
    @Required()
    @SType('object')
    public hash!: Buffer;

    @IsString()
    @Required()
    public originalFilename!: string;

    @IsString()
    @Required()
    public mimeType!: string;

    @IsInt()
    @IsOptional()
    @Optional()
    public size?: number | null;

    @IsString()
    @IsOptional()
    @Optional()
    public storagePath?: string | null;

    @IsUrl({ require_tld: false })
    @IsOptional()
    @Optional()
    public externalUrl?: string | null;

    @IsString()
    @IsOptional()
    @Optional()
    public textAssetPreview?: string;

    @IsObject()
    @Required()
    @SType('object')
    public metadata!: CommonMetadata & Record<string, unknown>;

    @IsString()
    @IsOptional()
    @Optional()
    public publicUrl?: string;
}
