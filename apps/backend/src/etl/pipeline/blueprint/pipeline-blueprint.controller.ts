import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { EntityManager } from '@mikro-orm/core';
import { PipelineBlueprintEntity } from './entity/pipeline-blueprint.entity.js';
import { PipelineBlueprintDto } from './dto/pipeline-blueprint.dto.js';
import type { CreatePipelineBlueprintDto } from './dto/create-pipeline-blueprint.dto.js';
import type { BlueprintDataDto } from './dto/blueprint-data.dto.js';
import { UpdatePipelineBlueprintDto } from './dto/update-pipeline-blueprint.dto.js';

@ApiTags('Blueprints')
@Controller('pipelines/blueprints')
export class PipelineBlueprintController {
    constructor(private readonly em: EntityManager) {}

    @Post()
    @ApiOperation({ summary: 'Create a new blueprint' })
    @ApiResponse({ status: 201, type: PipelineBlueprintDto })
    public async create(@Body() data: CreatePipelineBlueprintDto): Promise<PipelineBlueprintDto> {
        const blueprint = this.em.create(PipelineBlueprintEntity, {
            ...data,
            data:
                data.data ??
                ({
                    nodes: [],
                    edges: [],
                } satisfies BlueprintDataDto),
        });
        await this.em.flush();

        return blueprint;
    }

    @Get()
    @ApiOperation({ summary: 'Get all blueprints' })
    @ApiResponse({ status: 200, type: [PipelineBlueprintDto] })
    public findAll(): Promise<PipelineBlueprintDto[]> {
        return this.em.findAll(PipelineBlueprintEntity);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get a blueprint by ID' })
    @ApiResponse({ status: 200, type: PipelineBlueprintDto })
    @ApiResponse({ status: 404, description: 'Blueprint not found' })
    public findOne(@Param('id') id: number): Promise<PipelineBlueprintDto> {
        return this.em.findOneOrFail(PipelineBlueprintEntity, { id });
    }

    @Patch(':id')
    @ApiOperation({ summary: 'Update a blueprint by ID' })
    @ApiResponse({ status: 200, type: PipelineBlueprintDto })
    public async update(
        @Param('id') id: number,
        @Body() data: UpdatePipelineBlueprintDto,
    ): Promise<PipelineBlueprintDto> {
        const blueprint = await this.em.findOneOrFail(PipelineBlueprintEntity, { id });

        this.em.assign(blueprint, data);
        await this.em.flush();

        return blueprint;
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Delete a blueprint by ID' })
    @ApiResponse({ status: 204, description: 'Blueprint deleted' })
    public async remove(@Param('id') id: number): Promise<void> {
        await this.em.nativeDelete(PipelineBlueprintEntity, { id });
    }
}
