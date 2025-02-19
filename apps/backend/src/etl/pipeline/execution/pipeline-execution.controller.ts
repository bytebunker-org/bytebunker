import { Body, Controller, HttpCode, Param, ParseIntPipe, Post } from '@nestjs/common';
import { PipelineExecutionService } from './pipeline-execution.service.js';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { EntityManager } from '@mikro-orm/postgresql';
import { CreatePipelineExecutionDto } from '../dto/create-pipeline-execution.dto.js';
import { PipelineExecutionDto } from '../dto/pipeline-execution.dto.js';

@Controller('pipelines')
export class PipelineExecutionController {
    constructor(
        private readonly em: EntityManager,
        private readonly pipelineExecutionService: PipelineExecutionService,
    ) {}

    @Post()
    @ApiOperation({ summary: 'Create a new pipeline execution' })
    @ApiResponse({ status: 201, type: PipelineExecutionDto })
    public create(@Body() data: CreatePipelineExecutionDto): Promise<PipelineExecutionDto> {
        return this.em.transactional((em) =>
            this.pipelineExecutionService.executeBlueprintFromTrigger(
                em,
                data.blueprintId,
                data.triggerNodeId,
                data.triggerNodeInputData,
            ),
        );
    }

    @Post(':id/schedule-execution')
    @ApiOperation({ summary: 'Schedule the pipeline to be executed again' })
    @ApiResponse({ status: 204 })
    @HttpCode(204)
    public scheduleExecution(@Param('id', ParseIntPipe) id: number): Promise<void> {
        return this.pipelineExecutionService.schedulePipelineExecution(id, true);
    }
}
