import { IsInt, Min, IsOptional, IsEnum, IsObject, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { TimestampDto } from '../../../database/util/timestamp.dto.js';
import { PipelineExecutionDto } from './pipeline-execution.dto.js';
import { PipelineExecutionStatusEnum } from '../type/pipeline-execution-status.enum.js';
import type { DtoRef } from '../../../util/type/dto-ref.type.js';

export class PipelineExecutionDataDto extends TimestampDto {
    /** Identifier of the related pipeline execution */
    @IsInt()
    @Min(0)
    public pipelineExecutionId!: number;

    /** Related pipeline execution */
    @Type(() => PipelineExecutionDto)
    @IsObject()
    @ValidateNested()
    public pipelineExecution!: DtoRef<PipelineExecutionDto>;

    /** Identifier of the pipeline node */
    @IsInt()
    @Min(0)
    public nodeId!: number;

    /** Execution status of the pipeline node */
    @IsEnum(PipelineExecutionStatusEnum)
    public executionStatus!: PipelineExecutionStatusEnum;

    /** Additional data associated with the execution */
    @IsOptional()
    @IsObject()
    public data?: Record<string, unknown>;
}
