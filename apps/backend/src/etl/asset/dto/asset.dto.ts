import { TimestampDto } from '../../../database/util/timestamp.dto.js';
import { PrimaryKeyProp } from '@mikro-orm/core';
import { Allow, IsArray, IsEnum, IsObject, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';
import { AssetTypeEnum } from '../type/asset-type.enum.js';
import type { DtoRef } from '../../../util/type/dto-ref.type.js';
import { Type } from 'class-transformer';
import type { DtoCollection } from '../../../util/type/dto-collection.type.js';
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
    public storagePath!: string;

    @IsString()
    @Optional()
    public textAssetPreview?: string;

    @IsObject()
    @Required()
    @SType('object')
    public metadata!: CommonMetadata & Record<string, unknown>;

    @Type(() => AssetDto)
    @IsOptional()
    @IsObject()
    @ValidateNested()
    public parentAsset?: DtoRef<AssetDto>;

    @Type(() => AssetDto)
    @IsArray()
    @IsObject({ each: true })
    @ValidateNested({ each: true })
    public sidecarAssets!: DtoCollection<AssetDto>;
}
