import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { EntityManager } from '@mikro-orm/postgresql';
import { ApiOperation, ApiQuery } from '@nestjs/swagger';
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
import { PipelineModuleService } from './pipeline-module.service.js';
import {
    buildModuleCatalog,
    renderCatalogMarkdown,
    type ModuleCatalog,
} from './catalog/pipeline-module-catalog.util.js';
import type { PipelineModuleIdentifier } from './type/pipeline-module-identifier.type.js';

@Controller('pipelines-modules')
export class PipelineModuleController {
    constructor(
        private readonly findRestApiService: FindRestApiService,
        private readonly em: EntityManager,
        private readonly pipelineModuleService: PipelineModuleService,
    ) {}

    @Get('/catalog')
    @ApiOperation({
        summary:
            'Compact description of every module (inputs, outputs, description) plus the blueprint JSON format and an ' +
            'example. Meant to be pasted into an AI chat or prompt. Use ?format=markdown for text/markdown.',
    })
    @ApiQuery({ name: 'format', required: false, enum: ['json', 'markdown'] })
    public async catalog(
        @Query('format') format: string | undefined,
        @Res({ passthrough: true }) response: Response,
    ): Promise<ModuleCatalog | string> {
        const modules = await this.em
            .fork()
            .find(PipelineModuleEntity, {}, { populate: ['inputTypeSchema', 'outputTypeSchema'] });
        const catalog = buildModuleCatalog(
            modules.map((module) => ({
                id: module.id,
                type: module.type,
                description: this.pipelineModuleService.getPipelineModuleOptions(module.id)?.description,
                inputSchema: module.inputTypeSchema?.$.jsonSchema,
                outputSchema: module.outputTypeSchema?.$.jsonSchema,
            })),
        );

        if (format === 'markdown') {
            response.type('text/markdown; charset=utf-8');
            return renderCatalogMarkdown(catalog);
        }

        return catalog;
    }

    @Get('/')
    @ApiFindAllMethod(PipelineModuleDto)
    public findAll(@Query() query: FindAllDto<PipelineModuleEntity>): Promise<PipelineModuleDto[]> {
        return this.findRestApiService.findAll(PipelineModuleEntity, query);
    }

    @Get('/count')
    @ApiCountMethod(PipelineModuleDto)
    public count(@Query() query: FindRestApiCountDto<PipelineModuleEntity>): Promise<FindRestApiCountResponseDto> {
        return this.findRestApiService.count(PipelineModuleEntity, query);
    }

    @Get('/:id')
    @ApiOperation({ summary: 'Get a pipeline module by ID' })
    @ApiFindOneMethod(PipelineModuleDto)
    public findOne(
        @Param('id', ParsePipelineModuleIdentifierPipe) id: PipelineModuleIdentifier,
        @Query() query: FindOneDto<PipelineModuleEntity>,
    ): Promise<PipelineModuleDto> {
        return this.findRestApiService.findOne(PipelineModuleEntity, { id }, query);
    }
}
