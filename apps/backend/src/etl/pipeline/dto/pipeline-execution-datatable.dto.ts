import { PickType } from '@nestjs/swagger';
import { PipelineExecutionDto } from './pipeline-execution.dto.js';

export class PipelineExecutionDatatableDto extends PickType(PipelineExecutionDto, [
    'id',
    'executionStatus',
    'latestErrorStatus',
    'latestErrorMessage',
    'createdAt',
    'updatedAt',
] as const) {
    public blueprintName!: string;
}
