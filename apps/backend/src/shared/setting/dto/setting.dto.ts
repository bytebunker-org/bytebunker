import { IsBoolean, IsEnum, IsObject, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import type { JSONSchema7Type } from 'json-schema';
import { SettingValueDto } from './setting-value.dto.js';
import { SettingCategoryDto } from './setting-category.dto.js';
import { TimestampDto } from '../../../database/util/timestamp.dto.js';
import { SettingTypeEnum } from '../type/setting-type.enum.js';
import { SettingTargetTypeEnum } from '../type/setting-target-type.enum.js';
import type { DtoRef } from '../../../util/type/dto-ref.type.js';
import { Type } from 'class-transformer';
import type { ByteBunkerSettingKeys } from '../../../util/setting/setting.constant.js';
import type { DtoCollection } from '../../../util/type/dto-collection.type.js';
import { JsonSchemaDto } from '../../json-schema/dto/json-schema.dto.js';
import { PrimaryKeyProp } from '@mikro-orm/core';

export class SettingDto<SettingKey extends ByteBunkerSettingKeys = ByteBunkerSettingKeys> extends TimestampDto {
    [PrimaryKeyProp]?: 'key';

    @IsString()
    @MaxLength(128)
    public key!: SettingKey;

    @IsEnum(SettingTypeEnum)
    public type!: SettingTypeEnum;

    @ValidateNested()
    @IsOptional()
    @Type(() => SettingCategoryDto)
    public parentCategory!: DtoRef<SettingCategoryDto>;

    @IsEnum(SettingTargetTypeEnum)
    public targetType!: SettingTargetTypeEnum;

    @Type(() => JsonSchemaDto)
    @IsOptional()
    @IsObject()
    @ValidateNested()
    public validationSchema!: DtoRef<JsonSchemaDto>;

    @IsOptional()
    public defaultValue?: NonNullable<JSONSchema7Type> | undefined;

    @IsBoolean()
    public required!: boolean;

    @IsBoolean()
    public hidden!: boolean;

    @Type(() => SettingValueDto)
    @IsObject()
    @ValidateNested({ each: true })
    public settingValues!: DtoCollection<SettingValueDto>;
}
