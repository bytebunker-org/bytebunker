import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { EntityManager } from '@mikro-orm/core';
import { PipelineModuleEntity } from './entity/pipeline-module.entity.js';
import { PipelineModuleDto } from './dto/pipeline-module.dto.js';
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
import { ParsePipelineModuleIdentifierPipe } from './util/parse-pipeline-module-identifier.pipe.js';
import type { PipelineModuleIdentifier } from './type/pipeline-module-identifier.type.js';

@Controller('pipelines/modules')
export class PipelineModuleController {
    constructor(
        private readonly em: EntityManager,
        private readonly findRestApiService: FindRestApiService,
    ) {}

    @Get()
    @ApiFindAllMethod(PipelineModuleDto)
    public findAll(@Query() query: FindAllDto<PipelineModuleEntity>): Promise<PipelineModuleDto[]> {
        return this.findRestApiService.findAll(PipelineModuleEntity, query);
    }

    @Get('count')
    @ApiCountMethod(PipelineModuleDto)
    public count(@Query() query: FindRestApiCountDto<PipelineModuleEntity>): Promise<FindRestApiCountResponseDto> {
        return this.findRestApiService.count(PipelineModuleEntity, query);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get a pipeline module by ID' })
    @ApiFindOneMethod(PipelineModuleDto)
    public findOne(
        @Param('id', ParsePipelineModuleIdentifierPipe) id: PipelineModuleIdentifier,
        @Query() query: FindOneDto<PipelineModuleEntity>,
    ): Promise<PipelineModuleDto> {
        return this.findRestApiService.findOne(PipelineModuleEntity, { id }, query);
    }
}
