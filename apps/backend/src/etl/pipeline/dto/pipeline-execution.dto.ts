import { IsInt, IsOptional, IsString, IsEnum, IsObject, IsArray, ValidateNested, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { TimestampDto } from '../../../database/util/timestamp.dto.js';
import { PipelineBlueprintDto } from '../blueprint/dto/pipeline-blueprint.dto.js';
import { PipelineExecutionStatusEnum } from '../type/pipeline-execution-status.enum.js';
import type { PipelineExecutionLogDataDto } from './pipeline-execution-log-data.dto.js';
import type { DtoRef } from '../../../util/type/dto-ref.type.js';
import { PipelineExecutionLogDto } from './pipeline-execution-log.dto.js';
import { PipelineExecutionDataDto } from './pipeline-execution-data.dto.js';
import type { DtoCollection } from '../../../util/type/dto-collection.type.js';

export class PipelineExecutionDto extends TimestampDto {
    /** Unique identifier for the pipeline execution */
    @IsInt()
    @Min(0)
    public id!: number;

    /** Blueprint ID associated with the pipeline execution */
    @IsInt()
    public blueprintId!: number;

    /** Relation to the associated blueprint */
    @Type(() => PipelineBlueprintDto)
    @ValidateNested()
    public blueprint!: DtoRef<PipelineBlueprintDto>;

    /** Current execution status */
    @IsEnum(PipelineExecutionStatusEnum)
    public executionStatus!:
        | PipelineExecutionStatusEnum.WAITING
        | PipelineExecutionStatusEnum.SUCCESS
        | PipelineExecutionStatusEnum.FAILED
        | PipelineExecutionStatusEnum.ABORTED;

    /** Count of error retries */
    @IsInt()
    @Min(0)
    public errorRetryCount!: number;

    /** Node ID of the latest error, if any */
    @IsOptional()
    @IsInt()
    public latestErrorNodeId?: number;

    /** Status of the latest error, if any */
    @IsOptional()
    @IsEnum(PipelineExecutionStatusEnum)
    public latestErrorStatus?: PipelineExecutionStatusEnum;

    /** Message of the latest error, if any */
    @IsOptional()
    @IsString()
    public latestErrorMessage?: string;

    /** Data of the latest error, excluding the message */
    @IsOptional()
    @IsObject()
    public latestErrorData?: Omit<PipelineExecutionLogDataDto, 'message'>;

    /** Execution data associated with the pipeline execution */
    @Type(() => PipelineExecutionDataDto)
    @IsArray()
    @IsObject({ each: true })
    @ValidateNested({ each: true })
    public executionData!: DtoCollection<PipelineExecutionDataDto>;

    /** Execution logs associated with the pipeline execution */
    @Type(() => PipelineExecutionLogDto)
    @IsArray()
    @IsObject({ each: true })
    @ValidateNested({ each: true })
    public executionLogs!: DtoCollection<PipelineExecutionLogDto>;
}
