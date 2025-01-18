import { IsArray, IsInt, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { BlueprintDataDto } from './blueprint-data.dto.js';
import { PipelineExecutionDto } from '../../dto/pipeline-execution.dto.js';
import { TimestampDto } from '../../../../database/util/timestamp.dto.js';
import type { DtoCollection } from '../../../../util/type/dto-collection.type.js';

export class PipelineBlueprintDto extends TimestampDto {
    /** The unique identifier for the pipeline blueprint */
    @IsInt()
    public id!: number;

    /** The title of the pipeline blueprint */
    @IsString()
    public title!: string;

    /** An optional description of the pipeline blueprint */
    @IsOptional()
    @IsString()
    public description?: string;

    /** The data associated with the pipeline blueprint */
    @Type(() => BlueprintDataDto)
    @IsObject()
    @ValidateNested()
    public data!: BlueprintDataDto;

    /** The executions related to this pipeline blueprint */
    @Type(() => PipelineExecutionDto)
    @IsArray()
    @IsObject({ each: true })
    @ValidateNested({ each: true })
    public pipelineExecutions!: DtoCollection<PipelineExecutionDto>;
}
