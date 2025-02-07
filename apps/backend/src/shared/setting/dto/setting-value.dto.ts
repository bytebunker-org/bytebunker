import { Allow, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';
import { SettingDto } from './setting.dto.js';
import { TimestampDto } from '../../../database/util/timestamp.dto.js';
import type { SettingValueType } from '../type/setting-config.type.js';
import type { DtoRef } from '../../../util/type/dto-ref.type.js';
import { Type } from 'class-transformer';
import { UserDto } from '../../../user/dto/user.dto.js';
import { PrimaryKeyProp } from '@mikro-orm/core';

export class SettingValueDto<ValueType extends SettingValueType = SettingValueType> extends TimestampDto {
    [PrimaryKeyProp]?: ['setting', 'targetUser'];

    @Type(() => SettingDto)
    @IsObject()
    @ValidateNested()
    public setting!: DtoRef<SettingDto>;

    @Type(() => UserDto)
    @IsObject()
    @ValidateNested()
    public targetUser!: DtoRef<UserDto>;

    @Allow()
    public value!: ValueType;
}
