import { IsUUID, IsString, IsArray, IsObject, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { TimestampDto } from '../../database/util/timestamp.dto.js';
import { ExtensionDto } from './extension.dto.js';
import type { DtoRef } from '../../util/type/dto-ref.type.js';

export class ExtensionDeveloperDto extends TimestampDto {
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
    public extensions!: DtoRef<ExtensionDto[]>;
}
