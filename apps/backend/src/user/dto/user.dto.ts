import { TimestampDto } from '../../database/util/timestamp.dto.js';
import type { DateTime } from 'luxon';
import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { IsDateTime } from '../../util/custom-validator.util.js';

export class UserDto extends TimestampDto {
    @IsInt()
    public id!: number;

    @IsString()
    @IsNotEmpty()
    @MaxLength(32)
    public username!: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(60)
    public password?: string;

    @IsOptional()
    @IsDateTime()
    public deletedAt?: DateTime;
}
