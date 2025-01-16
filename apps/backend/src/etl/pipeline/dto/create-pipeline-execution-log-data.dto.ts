import { OmitType } from '@nestjs/swagger';
import { PipelineExecutionLogDataDto } from './pipeline-execution-log-data.dto.js';

export class CreatePipelineExecutionLogDataDto extends OmitType(PipelineExecutionLogDataDto, [] as const) {}
