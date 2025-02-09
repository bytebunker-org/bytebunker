import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { EntityManager } from '@mikro-orm/postgresql';
import { FindRestApiService } from '../../shared/find-rest-api/find-rest-api.service.js';
import { PipelineExecutionEntity } from './entity/pipeline-execution.entity.js';
import { PipelineExecutionDto } from './dto/pipeline-execution.dto.js';
import { PaginatedListRequestDto } from '../../shared/datatable/dto/paginated-list-request.dto.js';
import { FindAllDto } from '../../shared/find-rest-api/dto/find-all.dto.js';
import { FindRestApiCountDto } from '../../shared/find-rest-api/dto/find-rest-api-count.dto.js';
import { FindOneDto } from '../../shared/find-rest-api/dto/find-one.dto.js';
import { ApiFindAllDatatableMethod } from '../../shared/datatable/find-all-datatable-swagger.decorator.js';
import {
    ApiCountMethod,
    ApiFindAllMethod,
    ApiFindOneMethod,
} from '../../shared/find-rest-api/find-rest-api-swagger.decorator.js';
import { FindRestApiCountResponseDto } from '../../shared/find-rest-api/dto/find-rest-api-count-response.dto.js';
import { PipelineExecutionDatatableDto } from './dto/pipeline-execution-datatable.dto.js';
import { PipelineService } from './pipeline.service.js';

@Controller('pipelines')
export class PipelineController {
    constructor(
        private readonly em: EntityManager,
        private readonly findRestApiService: FindRestApiService,
        private readonly pipelineService: PipelineService,
    ) {}

    @Get('datatable-entries')
    @ApiFindAllDatatableMethod(PipelineExecutionDatatableDto)
    public findAllDatatable(@Query() data: PaginatedListRequestDto<PipelineExecutionDatatableDto>) {
        return this.em.transactional((em) => this.pipelineService.findAllDatatable(em, data));
    }

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
}
