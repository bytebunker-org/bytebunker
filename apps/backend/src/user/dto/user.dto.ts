import { TimestampDto } from '../../database/util/timestamp.dto.js';
import type { DateTime } from 'luxon';
import { IsArray, IsInt, IsNotEmpty, IsObject, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { IsDateTime } from '../../util/custom-validator.util.js';
import { PrimaryKeyProp } from '@mikro-orm/core';
import { Type } from 'class-transformer';
import type { DtoCollection } from '../../util/type/dto-collection.type.js';
import { StoredUserSessionDto } from '../../auth/dto/stored-user-session.dto.js';
import { ApiHideProperty } from '@nestjs/swagger';

export class UserDto extends TimestampDto {
    [PrimaryKeyProp]?: 'id';

    @IsInt()
    public id!: number;

    @IsString()
    @IsNotEmpty()
    @MaxLength(32)
    public username!: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(60)
    @ApiHideProperty()
    public password?: string;

    @IsOptional()
    @IsDateTime()
    public deletedAt?: DateTime;

    @Type(() => StoredUserSessionDto)
    @IsArray()
    @IsObject({ each: true })
    @ValidateNested({ each: true })
    public storedUserSessions!: DtoCollection<StoredUserSessionDto>;
}
