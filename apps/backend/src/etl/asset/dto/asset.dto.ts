import { TimestampDto } from '../../../database/util/timestamp.dto.js';
import { PrimaryKeyProp } from '@mikro-orm/core';
import { Allow, IsArray, IsEnum, IsObject, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';
import { AssetTypeEnum } from '../type/asset-type.enum.js';
import type { DtoRef } from '../../../util/type/dto-ref.type.js';
import { Type } from 'class-transformer';
import type { DtoCollection } from '../../../util/type/dto-collection.type.js';
import type { CommonMetadata } from '../common-metadata.interface.js';

export class AssetDto extends TimestampDto {
    [PrimaryKeyProp]?: 'id';

    @IsUUID()
    public id!: string;

    @IsEnum(AssetTypeEnum)
    public type!: AssetTypeEnum;

    @Allow()
    public hash!: Buffer;

    @IsString()
    public storagePath!: string;

    @IsObject()
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
