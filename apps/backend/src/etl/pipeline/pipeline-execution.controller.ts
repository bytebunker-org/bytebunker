import { Controller, Delete, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { EntityManager } from '@mikro-orm/core';
import { PipelineExecutionEntity } from './entity/pipeline-execution.entity.js';
import { PipelineExecutionDto } from './dto/pipeline-execution.dto.js';
import { FindRestApiService } from '../../shared/find-rest-api/find-rest-api.service.js';
import {
    ApiCountMethod,
    ApiFindAllMethod,
    ApiFindOneMethod,
} from '../../shared/find-rest-api/find-rest-api-swagger.decorator.js';
import { FindRestApiCountDto } from '../../shared/find-rest-api/dto/find-rest-api-count.dto.js';
import { FindAllDto } from '../../shared/find-rest-api/dto/find-all.dto.js';
import { FindRestApiCountResponseDto } from '../../shared/find-rest-api/dto/find-rest-api-count-response.dto.js';
import { FindOneDto } from '../../shared/find-rest-api/dto/find-one.dto.js';

@Controller('pipelines/executions')
export class PipelineExecutionController {
    constructor(
        private readonly em: EntityManager,
        private readonly findRestApiService: FindRestApiService,
    ) {}

    @Get()
    @ApiFindAllMethod(PipelineExecutionDto)
    public findAll(@Query() query: FindAllDto<PipelineExecutionEntity>): Promise<PipelineExecutionDto[]> {
        return this.findRestApiService.findAll(PipelineExecutionEntity, query);
    }

    @Get('count')
    @ApiCountMethod(PipelineExecutionDto)
    public count(@Query() query: FindRestApiCountDto<PipelineExecutionEntity>): Promise<FindRestApiCountResponseDto> {
        return this.findRestApiService.count(PipelineExecutionEntity, query);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get a pipeline execution by ID' })
    @ApiFindOneMethod(PipelineExecutionDto)
    public findOne(
        @Param('id', ParseIntPipe) id: number,
        @Query() query: FindOneDto<PipelineExecutionEntity>,
    ): Promise<PipelineExecutionDto> {
        return this.findRestApiService.findOne(PipelineExecutionEntity, { id }, query);
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Delete a pipeline execution' })
    @ApiResponse({ status: 204, description: 'Execution deleted' })
    public async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
        await this.em.nativeDelete(PipelineExecutionEntity, { id });
    }
}
