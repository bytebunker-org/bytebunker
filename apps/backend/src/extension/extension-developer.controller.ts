import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { EntityManager } from '@mikro-orm/core';
import { FindRestApiService } from '../shared/find-rest-api/find-rest-api.service.js';
import {
    ApiCountMethod,
    ApiFindAllMethod,
    ApiFindOneMethod,
} from '../shared/find-rest-api/find-rest-api-swagger.decorator.js';
import { FindRestApiCountResponseDto } from '../shared/find-rest-api/dto/find-rest-api-count-response.dto.js';
import { FindRestApiCountDto } from '../shared/find-rest-api/dto/find-rest-api-count.dto.js';
import { FindAllDto } from '../shared/find-rest-api/dto/find-all.dto.js';
import { FindOneDto } from '../shared/find-rest-api/dto/find-one.dto.js';
import { ExtensionDeveloperDto } from './dto/extension-developer.dto.js';
import { ExtensionDeveloperEntity } from './entity/extension-developer.entity.js';
import { CreateExtensionDeveloperDto } from './dto/create-extension-developer.dto.js';

@Controller('extensions/developers')
export class ExtensionDeveloperController {
    constructor(
        private readonly em: EntityManager,
        private readonly findRestApiService: FindRestApiService,
    ) {}

    @Post()
    @ApiOperation({ summary: 'Create a new extension developer' })
    @ApiResponse({ status: 201, type: ExtensionDeveloperDto })
    public async create(@Body() data: CreateExtensionDeveloperDto): Promise<ExtensionDeveloperDto> {
        const extension = this.em.create(ExtensionDeveloperEntity, {
            id: data.id,
            name: data.name,
        });
        await this.em.flush();

        return extension;
    }

    @Get()
    @ApiFindAllMethod(ExtensionDeveloperDto)
    public findAll(@Query() query: FindAllDto<ExtensionDeveloperEntity>): Promise<ExtensionDeveloperDto[]> {
        return this.findRestApiService.findAll(ExtensionDeveloperEntity, query);
    }

    @Get('count')
    @ApiCountMethod(ExtensionDeveloperDto)
    public count(@Query() query: FindRestApiCountDto<ExtensionDeveloperEntity>): Promise<FindRestApiCountResponseDto> {
        return this.findRestApiService.count(ExtensionDeveloperEntity, query);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get an extension developer by ID' })
    @ApiFindOneMethod(ExtensionDeveloperDto)
    public findOne(
        @Param('id', ParseUUIDPipe) id: string,
        @Query() query: FindOneDto<ExtensionDeveloperEntity>,
    ): Promise<ExtensionDeveloperDto> {
        return this.findRestApiService.findOne(ExtensionDeveloperEntity, { id }, query);
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Delete an extension developer' })
    @ApiResponse({ status: 204, description: 'Extension developer deleted' })
    public async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
        await this.em.nativeDelete(ExtensionDeveloperEntity, { id });
    }
}
