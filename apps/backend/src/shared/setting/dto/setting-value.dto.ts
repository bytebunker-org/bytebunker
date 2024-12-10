import { Allow, IsOptional, IsString, ValidateNested } from 'class-validator';
import { SettingDto } from './setting.dto.js';
import { TimestampDto } from '../../../database/util/timestamp.dto.js';
import type { SettingConfigType, SettingValueType } from '../type/setting-config.type.js';
import type { DtoRelation } from '../../../util/type/dto-relation.type.js';
import { Type } from 'class-transformer';
import { UserDto } from '../../../user/dto/user.dto.js';

export class SettingValueDto<
    SettingConfig extends SettingConfigType = SettingConfigType,
    ValueType extends SettingValueType = SettingValueType,
> extends TimestampDto {
    @IsString()
    public settingKey!: keyof SettingConfig['settings'];

    @ValidateNested()
    @IsOptional()
    @Type(() => SettingDto)
    public setting?: DtoRelation<SettingDto>;

    @IsString()
    public targetUserId!: number;

    @ValidateNested()
    @IsOptional()
    @Type(() => UserDto)
    public targetUser?: DtoRelation<UserDto>;

    @Allow()
    public value!: ValueType;
}
