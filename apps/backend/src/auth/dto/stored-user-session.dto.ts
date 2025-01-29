import { TimestampDto } from '../../database/util/timestamp.dto.js';
import { PrimaryKeyProp } from '@mikro-orm/core';
import type { SessionData } from 'express-session';
import type { DateTime } from 'luxon';
import { IsDateTime } from '../../util/custom-validator.util.js';
import { IsNotEmpty, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { UserDto } from '../../user/dto/user.dto.js';
import type { DtoRef } from '../../util/type/dto-ref.type.js';

export class StoredUserSessionDto extends TimestampDto {
    [PrimaryKeyProp]?: 'sessionId';

    @IsString()
    @IsNotEmpty()
    public sessionId!: string;

    @IsObject()
    public data!: SessionData;

    @IsDateTime()
    public expiresAt!: DateTime;

    @Type(() => UserDto)
    @IsOptional()
    @IsObject()
    @ValidateNested()
    public user?: DtoRef<UserDto>;
}
