import { PickType } from '@nestjs/swagger';
import { PipelineExecutionLogDto } from './pipeline-execution-log.dto.js';

export class PipelineExecutionLogDatatableDto extends PickType(PipelineExecutionLogDto, [
    'id',
    'nodeId',
    'message',
    'data',
    'createdAt',
] as const) {}
