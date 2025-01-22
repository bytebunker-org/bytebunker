import { PickType } from '@nestjs/swagger';
import type { ByteBunkerSettingKeys } from '../../../util/setting/setting.constant.js';
import { IsArray, IsObject, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { SettingValueDto } from './setting-value.dto.js';

export class StoreSettingValueDto extends PickType(SettingValueDto, ['value'] as const) {
    @IsString()
    @MaxLength(128)
    public settingKey!: ByteBunkerSettingKeys;
}

export class StoreSettingValuesDto {
    @Type(() => StoreSettingValueDto)
    @IsArray()
    @MinLength(1)
    @IsObject({ each: true })
    @ValidateNested({ each: true })
    public values!: StoreSettingValueDto[];
}
