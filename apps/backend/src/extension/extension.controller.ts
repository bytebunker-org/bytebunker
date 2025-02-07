import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { EntityManager } from '@mikro-orm/core';
import { ExtensionEntity } from './entity/extension.entity.js';
import { ExtensionDto } from './dto/extension.dto.js';
import { FindRestApiService } from '../shared/find-rest-api/find-rest-api.service.js';
import { CreateExtensionDto } from './dto/create-extension.dto.js';
import {
    ApiCountMethod,
    ApiFindAllMethod,
    ApiFindOneMethod,
} from '../shared/find-rest-api/find-rest-api-swagger.decorator.js';
import { FindRestApiCountResponseDto } from '../shared/find-rest-api/dto/find-rest-api-count-response.dto.js';
import { FindRestApiCountDto } from '../shared/find-rest-api/dto/find-rest-api-count.dto.js';
import { FindOneDto } from '../shared/find-rest-api/dto/find-one.dto.js';
import { ExtensionDeveloperEntity } from './entity/extension-developer.entity.js';
import { FindAllDto } from '../shared/find-rest-api/dto/find-all.dto.js';
import type { LocalExtensionId } from './extensions/local-extension.constant.js';

@Controller('extensions')
export class ExtensionController {
    constructor(
        private readonly em: EntityManager,
        private readonly findRestApiService: FindRestApiService,
    ) {}

    @Post()
    @ApiOperation({ summary: 'Create a new extension' })
    @ApiResponse({ status: 201, type: ExtensionDto })
    public async create(@Body() data: CreateExtensionDto): Promise<ExtensionDto> {
        const extension = this.em.create(ExtensionEntity, {
            id: data.id,
            name: data.name,
            developer: this.em.getReference(ExtensionDeveloperEntity, data.developerId),
        });
        await this.em.flush();

        return extension;
    }

    @Get()
    @ApiFindAllMethod(ExtensionDto)
    public findAll(@Query() query: FindAllDto<ExtensionEntity>): Promise<ExtensionDto[]> {
        return this.findRestApiService.findAll(ExtensionEntity, query);
    }

    @Get('count')
    @ApiCountMethod(ExtensionDto)
    public count(@Query() query: FindRestApiCountDto<ExtensionEntity>): Promise<FindRestApiCountResponseDto> {
        return this.findRestApiService.count(ExtensionEntity, query);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get an extension by ID' })
    @ApiFindOneMethod(ExtensionDto)
    public findOne(
        @Param('id', ParseUUIDPipe) id: LocalExtensionId,
        @Query() query: FindOneDto<ExtensionEntity>,
    ): Promise<ExtensionDto> {
        return this.findRestApiService.findOne(ExtensionEntity, { id }, query);
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Delete an extension' })
    @ApiResponse({ status: 204, description: 'Extension deleted' })
    public async remove(@Param('id', ParseUUIDPipe) id: LocalExtensionId): Promise<void> {
        await this.em.nativeDelete(ExtensionEntity, { id });
    }
}
