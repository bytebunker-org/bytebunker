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
import type { PipelineExecutionEntity } from '../entity/pipeline-execution.entity.js';

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
        return this.createAndSchedule((em) =>
            this.pipelineExecutionService.createRerunFromTrigger(em, id, { dryRun: false }),
        );
    }

    @Post(':id/dry-run')
    @ApiOperation({ summary: 'Preview an execution again as a dry run, from the same trigger output' })
    @ApiResponse({ status: 201, type: PipelineExecutionDto })
    public dryRun(@Param('id', ParseIntPipe) id: number): Promise<PipelineExecutionDto> {
        return this.createAndSchedule((em) =>
            this.pipelineExecutionService.createRerunFromTrigger(em, id, { dryRun: true }),
        );
    }

    @Post()
    @ApiOperation({ summary: 'Create a new pipeline execution' })
    @ApiResponse({ status: 201, type: PipelineExecutionDto })
    public create(@Body() data: CreatePipelineExecutionDto): Promise<PipelineExecutionDto> {
        return this.createAndSchedule((em) =>
            this.pipelineExecutionService.createExecutionFromTrigger(
                em,
                data.blueprintId,
                data.triggerNodeId,
                data.triggerNodeInputData,
            ),
        );
    }

    @Post(':id/nodes/:nodeId/retry')
    @ApiOperation({
        summary:
            'Run a node and everything downstream of it again. Their previous output is discarded; the execution ' +
            'goes back to waiting.',
    })
    @ApiResponse({ status: 204 })
    @HttpCode(204)
    public async retryFromNode(
        @Param('id', ParseIntPipe) id: number,
        @Param('nodeId', ParseIntPipe) nodeId: number,
    ): Promise<void> {
        const resetNodeIds = await this.em.transactional((em) =>
            this.pipelineExecutionService.resetFromNode(em, id, nodeId),
        );
        await this.progressService.clearNodes(id, resetNodeIds);
        await this.pipelineExecutionService.schedulePipelineExecution(id);
    }

    @Post(':id/abort')
    @ApiOperation({
        summary: 'Abort an execution: a module that is running finishes, but no further modules start',
    })
    @ApiResponse({ status: 204 })
    @HttpCode(204)
    public abort(@Param('id', ParseIntPipe) id: number): Promise<void> {
        return this.em.transactional((em) => this.pipelineExecutionService.abortExecution(em, id));
    }

    @Post(':id/schedule-execution')
    @ApiOperation({ summary: 'Retry all failed and aborted nodes of the execution and continue it' })
    @ApiResponse({ status: 204 })
    @HttpCode(204)
    public scheduleExecution(@Param('id', ParseIntPipe) id: number): Promise<void> {
        return this.pipelineExecutionService.schedulePipelineExecution(id, true);
    }

    /** Creates the execution in its own transaction and queues it only once that transaction committed. */
    private async createAndSchedule(
        create: (em: EntityManager) => Promise<PipelineExecutionEntity>,
    ): Promise<PipelineExecutionEntity> {
        const execution = await this.em.transactional(create);
        await this.pipelineExecutionService.schedulePipelineExecution(execution.id);

        return execution;
    }
}
