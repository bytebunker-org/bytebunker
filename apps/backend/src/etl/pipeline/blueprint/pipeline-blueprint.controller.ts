import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { EntityManager } from '@mikro-orm/postgresql';
import { PipelineBlueprintEntity } from './entity/pipeline-blueprint.entity.js';
import { PipelineBlueprintDto } from './dto/pipeline-blueprint.dto.js';
import type { CreatePipelineBlueprintDto } from './dto/create-pipeline-blueprint.dto.js';
import { UpdatePipelineBlueprintDto } from './dto/update-pipeline-blueprint.dto.js';
import { FindRestApiService } from '../../../shared/find-rest-api/find-rest-api.service.js';
import { FindAllDto } from '../../../shared/find-rest-api/dto/find-all.dto.js';
import { FindOneDto } from '../../../shared/find-rest-api/dto/find-one.dto.js';
import { FindRestApiCountResponseDto } from '../../../shared/find-rest-api/dto/find-rest-api-count-response.dto.js';
import { FindRestApiCountDto } from '../../../shared/find-rest-api/dto/find-rest-api-count.dto.js';
import {
    ApiCountMethod,
    ApiFindAllMethod,
    ApiFindOneMethod,
} from '../../../shared/find-rest-api/find-rest-api-swagger.decorator.js';
import { PaginatedListRequestDto } from '../../../shared/datatable/dto/paginated-list-request.dto.js';
import { PaginatedListResponseDto } from '../../../shared/datatable/dto/paginated-list-response.dto.js';
import { PipelineBlueprintDatatableDto } from './dto/pipeline-blueprint-datatable.dto.js';
import { PipelineBlueprintService } from './pipeline-blueprint.service.js';
import { ApiFindAllDatatableMethod } from '../../../shared/datatable/find-all-datatable-swagger.decorator.js';

@Controller('pipelines-blueprints')
export class PipelineBlueprintController {
    constructor(
        private readonly em: EntityManager,
        private readonly findRestApiService: FindRestApiService,
        private readonly pipelineBlueprintService: PipelineBlueprintService,
    ) {}

    @Post()
    @ApiOperation({ summary: 'Create a new blueprint' })
    @ApiResponse({ status: 201, type: PipelineBlueprintDto })
    public create(@Body() data: CreatePipelineBlueprintDto): Promise<PipelineBlueprintDto> {
        return this.em.transactional((em) => this.pipelineBlueprintService.createBlueprint(em, data));
    }

    @Get('datatable-entries')
    @ApiFindAllDatatableMethod(PipelineBlueprintDatatableDto)
    @ApiOperation({
        summary: `Get blueprints for datatable`,
        parameters: [{ in: 'query', name: 'test', schema: { type: 'string' }, required: true }],
    })
    public findAllDatatable(
        @Query() data: PaginatedListRequestDto<PipelineBlueprintDatatableDto>,
    ): Promise<PaginatedListResponseDto<PipelineBlueprintDatatableDto>> {
        return this.em.transactional((em) => this.pipelineBlueprintService.findAllDatatable(em, data));
    }

    @Get()
    @ApiFindAllMethod(PipelineBlueprintDto)
    public findAll(@Query() query: FindAllDto<PipelineBlueprintEntity>): Promise<PipelineBlueprintDto[]> {
        return this.findRestApiService.findAll(PipelineBlueprintEntity, query);
    }

    @Get('count')
    @ApiCountMethod(PipelineBlueprintDto)
    public count(@Query() query: FindRestApiCountDto<PipelineBlueprintEntity>): Promise<FindRestApiCountResponseDto> {
        return this.findRestApiService.count(PipelineBlueprintEntity, query);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get a blueprint by ID' })
    @ApiFindOneMethod(PipelineBlueprintDto)
    public findOne(
        @Param('id', ParseIntPipe) id: number,
        @Query() query: FindOneDto<PipelineBlueprintEntity>,
    ): Promise<PipelineBlueprintDto> {
        return this.findRestApiService.findOne(PipelineBlueprintEntity, { id }, query);
    }

    @Patch(':id')
    @ApiOperation({ summary: 'Update a blueprint by ID' })
    @ApiResponse({ status: 200, type: PipelineBlueprintDto })
    public update(
        @Param('id', ParseIntPipe) id: number,
        @Body() data: UpdatePipelineBlueprintDto,
    ): Promise<PipelineBlueprintDto> {
        return this.em.transactional((em) => this.pipelineBlueprintService.updateBlueprint(em, id, data));
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Delete a blueprint by ID' })
    @ApiResponse({ status: 204, description: 'Blueprint deleted' })
    public async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
        await this.em.nativeDelete(PipelineBlueprintEntity, { id });
    }
}
