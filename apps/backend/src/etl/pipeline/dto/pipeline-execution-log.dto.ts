import { IsInt, IsOptional, IsString, IsObject, ValidateNested, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { TimestampDto } from '../../../database/util/timestamp.dto.js';
import { PipelineExecutionDto } from './pipeline-execution.dto.js';
import type { PipelineExecutionLogDataDto } from './pipeline-execution-log-data.dto.js';
import type { DtoRef } from '../../../util/type/dto-ref.type.js';
import { PrimaryKeyProp } from '@mikro-orm/core';

export class PipelineExecutionLogDto extends TimestampDto {
    [PrimaryKeyProp]?: 'id';

    /** Unique identifier for the execution log */
    @IsInt()
    @Min(0)
    public id!: number;

    /** Related pipeline execution */
    @Type(() => PipelineExecutionDto)
    @IsObject()
    @ValidateNested()
    public pipelineExecution!: DtoRef<PipelineExecutionDto>;

    /** Identifier of the pipeline node */
    @IsInt()
    @Min(0)
    public nodeId!: number;

    /** Log message, if any */
    @IsOptional()
    @IsString()
    public message?: string;

    /** Additional data associated with the log, excluding the message */
    @IsOptional()
    @IsObject()
    public data?: Omit<PipelineExecutionLogDataDto, 'message'>;
}
