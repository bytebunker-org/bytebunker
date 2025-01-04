import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
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

export class SettingDto<SettingKey extends ByteBunkerSettingKeys = ByteBunkerSettingKeys> extends TimestampDto {
    @IsString()
    @MaxLength(128)
    public key!: SettingKey;

    @IsEnum(SettingTypeEnum)
    public type!: SettingTypeEnum;

    @IsString()
    @MaxLength(64)
    public parentCategoryKey!: string;

    @ValidateNested()
    @IsOptional()
    @Type(() => SettingCategoryDto)
    public parentCategory!: DtoRef<SettingCategoryDto>;

    @IsEnum(SettingTargetTypeEnum)
    public targetType!: SettingTargetTypeEnum;

    @IsOptional()
    @IsString()
    public validationSchemaUri?: string;

    @IsOptional()
    public defaultValue?: NonNullable<JSONSchema7Type> | undefined;

    @IsBoolean()
    public required!: boolean;

    @IsBoolean()
    public hidden!: boolean;

    @ValidateNested({ each: true })
    @IsOptional()
    @Type(() => SettingValueDto)
    public settingValues?: DtoCollection<SettingValueDto>;
}
