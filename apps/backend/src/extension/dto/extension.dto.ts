import { IsArray, IsObject, IsString, IsUUID, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { TimestampDto } from '../../database/util/timestamp.dto.js';
import { PipelineModuleDto } from '../../etl/pipeline/pipeline-module/dto/pipeline-module.dto.js';
import type { DtoCollection } from '../../util/type/dto-collection.type.js';

export class ExtensionDto extends TimestampDto {
    /** Unique identifier for the extension */
    @IsUUID()
    public id!: string;

    /** Name of the extension */
    @IsString()
    public name!: string;

    /** Pipeline modules associated with the extension */
    @Type(() => PipelineModuleDto)
    @IsArray()
    @IsObject({ each: true })
    @ValidateNested({ each: true })
    public modules!: DtoCollection<PipelineModuleDto>;
}
