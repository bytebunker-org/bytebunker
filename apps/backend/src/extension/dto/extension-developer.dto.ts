import { IsArray, IsObject, IsString, IsUUID, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { TimestampDto } from '../../database/util/timestamp.dto.js';
import { ExtensionDto } from './extension.dto.js';
import type { DtoCollection } from '../../util/type/dto-collection.type.js';
import { PrimaryKeyProp } from '@mikro-orm/core';

export class ExtensionDeveloperDto extends TimestampDto {
    [PrimaryKeyProp]?: 'id';

    /** Unique identifier for the developer */
    @IsUUID()
    public id!: string;

    /** Name of the developer */
    @IsString()
    public name!: string;

    /** Extensions associated with the developer */
    @Type(() => ExtensionDto)
    @IsArray()
    @IsObject({ each: true })
    @ValidateNested({ each: true })
    public extensions!: DtoCollection<ExtensionDto>;
}
