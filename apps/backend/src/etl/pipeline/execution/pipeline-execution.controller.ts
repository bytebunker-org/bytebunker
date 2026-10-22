import { Body, Controller, Get, HttpCode, type MessageEvent, Param, ParseIntPipe, Post, Sse } from '@nestjs/common';
import { distinctUntilChanged, from, interval, map, type Observable, startWith, switchMap, takeWhile } from 'rxjs';
import { PipelineProgressService } from '../progress/pipeline-progress.service.js';
import { PipelineProgressDto } from '../progress/dto/pipeline-progress.dto.js';
import { PipelineExecutionStatusEnum } from '../type/pipeline-execution-status.enum.js';
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
        private readonly progressService: PipelineProgressService,
    ) {}

    @Get(':id/progress')
    @ApiOperation({ summary: 'Live progress of a pipeline execution: per node and weighted for the whole pipeline' })
    @ApiResponse({ status: 200, type: PipelineProgressDto })
    public getProgress(@Param('id', ParseIntPipe) id: number): Promise<PipelineProgressDto> {
        return this.progressService.getProgress(this.em.fork(), id);
    }

    @Sse(':id/progress/stream')
    @ApiOperation({ summary: 'Server-sent events with the execution progress; completes once the execution ends' })
    public streamProgress(@Param('id', ParseIntPipe) id: number): Observable<MessageEvent> {
        const terminal = new Set<string>([
            PipelineExecutionStatusEnum.SUCCESS,
            PipelineExecutionStatusEnum.FAILED,
            PipelineExecutionStatusEnum.ABORTED,
        ]);

        return interval(1000).pipe(
            startWith(0),
            switchMap(() => from(this.progressService.getProgress(this.em.fork(), id))),
            map((progress) => JSON.stringify(progress)),
            distinctUntilChanged(),
            // Emit the final state, then end the stream.
            takeWhile((json) => !terminal.has((JSON.parse(json) as PipelineProgressDto).executionStatus), true),
            map((data) => ({ data }) satisfies MessageEvent),
        );
    }

    @Post(':id/apply')
    @ApiOperation({ summary: 'Run a (dry-run) execution again for real, from the same trigger output' })
    @ApiResponse({ status: 201, type: PipelineExecutionDto })
    public apply(@Param('id', ParseIntPipe) id: number): Promise<PipelineExecutionDto> {
        return this.em.transactional((em) => this.pipelineExecutionService.rerunFromTrigger(em, id, { dryRun: false }));
    }

    @Post(':id/dry-run')
    @ApiOperation({ summary: 'Preview an execution again as a dry run, from the same trigger output' })
    @ApiResponse({ status: 201, type: PipelineExecutionDto })
    public dryRun(@Param('id', ParseIntPipe) id: number): Promise<PipelineExecutionDto> {
        return this.em.transactional((em) => this.pipelineExecutionService.rerunFromTrigger(em, id, { dryRun: true }));
    }

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
