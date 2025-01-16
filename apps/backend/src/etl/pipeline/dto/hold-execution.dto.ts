import { IsBoolean, IsInt, IsObject, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { PipelineExecutionLogDataDto } from './pipeline-execution-log-data.dto.js';
import type { PipelineModuleIdentifier } from '../type/pipeline-module-identifier.type.js';

export class HoldExecutionDto {
    @IsInt()
    @Min(0)
    public executionId!: number;

    @IsString()
    public moduleId!: PipelineModuleIdentifier;

    @IsInt()
    @Min(0)
    public nodeId!: number;

    @IsBoolean()
    public isAbort!: boolean;

    @IsBoolean()
    public isUnexpectedError!: boolean;

    @Type(() => PipelineExecutionLogDataDto)
    @IsOptional()
    @IsObject()
    @ValidateNested()
    public executionLog?: PipelineExecutionLogDataDto;
}
