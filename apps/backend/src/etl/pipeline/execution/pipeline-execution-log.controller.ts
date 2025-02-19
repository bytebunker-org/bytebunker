import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { EntityManager, ref } from '@mikro-orm/postgresql';
import { FindRestApiService } from '../../../shared/find-rest-api/find-rest-api.service.js';
import {
    ApiCountMethod,
    ApiFindAllMethod,
    ApiFindOneMethod,
} from '../../../shared/find-rest-api/find-rest-api-swagger.decorator.js';
import { FindAllDto } from '../../../shared/find-rest-api/dto/find-all.dto.js';
import { PipelineExecutionLogDto } from '../dto/pipeline-execution-log.dto.js';
import { PipelineExecutionLogEntity } from '../entity/pipeline-execution-log.entity.js';
import { FindRestApiCountResponseDto } from '../../../shared/find-rest-api/dto/find-rest-api-count-response.dto.js';
import { FindRestApiCountDto } from '../../../shared/find-rest-api/dto/find-rest-api-count.dto.js';
import { FindOneDto } from '../../../shared/find-rest-api/dto/find-one.dto.js';
import { PipelineExecutionEntity } from '../entity/pipeline-execution.entity.js';

@Controller('pipelines/:pipelineId/logs')
export class PipelineExecutionLogController {
    constructor(
        private readonly em: EntityManager,
        private readonly findRestApiService: FindRestApiService,
    ) {}

    @Get()
    @ApiFindAllMethod(PipelineExecutionLogDto)
    public findAll(
        @Param('pipelineId', ParseIntPipe) pipelineId: number,
        @Query() query: FindAllDto<PipelineExecutionLogEntity>,
    ): Promise<PipelineExecutionLogDto[]> {
        return this.findRestApiService.findAll(PipelineExecutionLogEntity, query, {
            pipelineExecution: ref(PipelineExecutionEntity, pipelineId),
        });
    }

    @Get('count')
    @ApiCountMethod(PipelineExecutionLogDto)
    public count(
        @Param('pipelineId', ParseIntPipe) pipelineId: number,
        @Query() query: FindRestApiCountDto<PipelineExecutionLogEntity>,
    ): Promise<FindRestApiCountResponseDto> {
        return this.findRestApiService.count(PipelineExecutionLogEntity, query, {
            pipelineExecution: ref(PipelineExecutionEntity, pipelineId),
        });
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get a pipeline execution log by ID' })
    @ApiFindOneMethod(PipelineExecutionLogDto)
    public findOne(
        @Param('pipelineId', ParseIntPipe) pipelineId: number,
        @Param('id', ParseIntPipe) id: number,
        @Query() query: FindOneDto<PipelineExecutionLogEntity>,
    ): Promise<PipelineExecutionLogDto> {
        return this.findRestApiService.findOne(
            PipelineExecutionLogEntity,
            { id, pipelineExecution: ref(PipelineExecutionEntity, pipelineId) },
            query,
        );
    }
}
