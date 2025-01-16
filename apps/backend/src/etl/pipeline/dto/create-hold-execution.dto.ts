import { IsObject, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { PickType } from '@nestjs/swagger';
import { HoldExecutionDto } from './hold-execution.dto.js';
import { CreatePipelineExecutionLogDataDto } from './create-pipeline-execution-log-data.dto.js';

export class CreateHoldExecutionDto extends PickType(HoldExecutionDto, ['isUnexpectedError', 'isAbort'] as const) {
    @Type(() => CreatePipelineExecutionLogDataDto)
    @IsOptional()
    @IsObject()
    @ValidateNested()
    public executionLog?: CreatePipelineExecutionLogDataDto;

    constructor(data: CreateHoldExecutionDto) {
        super();

        Object.assign(this, data);
    }
}
