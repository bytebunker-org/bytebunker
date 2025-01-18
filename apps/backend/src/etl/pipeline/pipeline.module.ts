import { Module } from '@nestjs/common';
import { PipelineService } from './pipeline.service.js';
import { PipelineExecutionService } from './pipeline-execution.service.js';

@Module({
    providers: [PipelineService, PipelineExecutionService],
    exports: [PipelineService, PipelineExecutionService],
})
export class PipelineModule {}
