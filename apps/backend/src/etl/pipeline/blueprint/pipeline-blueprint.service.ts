import { Injectable } from '@nestjs/common';
import { type EntityManager } from '@mikro-orm/postgresql';
import { PipelineBlueprintEntity } from './entity/pipeline-blueprint.entity.js';
import { DatatableService } from '../../../shared/datatable/datatable.service.js';
import type { PaginatedListRequestDto } from '../../../shared/datatable/dto/paginated-list-request.dto.js';
import type { PaginatedListResponseDto } from '../../../shared/datatable/dto/paginated-list-response.dto.js';
import type { PipelineBlueprintDatatableDto } from './dto/pipeline-blueprint-datatable.dto.js';
import type { CreatePipelineBlueprintDto } from './dto/create-pipeline-blueprint.dto.js';
import type { BlueprintDataDto } from './dto/blueprint-data.dto.js';
import { PipelineModuleEntity } from '../pipeline-module/entity/pipeline-module.entity.js';
import type { UpdatePipelineBlueprintDto } from './dto/update-pipeline-blueprint.dto.js';

@Injectable()
export class PipelineBlueprintService {
    constructor(private readonly datatableService: DatatableService) {}

    public async createBlueprint(
        em: EntityManager,
        data: CreatePipelineBlueprintDto,
    ): Promise<PipelineBlueprintEntity> {
        const blueprint = em.create(PipelineBlueprintEntity, {
            ...data,
            data:
                data.data ??
                ({
                    nodes: [],
                    edges: [],
                } satisfies BlueprintDataDto),
        });

        if (data.data?.nodes?.length) {
            blueprint.usedModules.add(data.data.nodes.map((n) => em.getReference(PipelineModuleEntity, n.moduleId)));
        }

        await em.flush();

        return blueprint;
    }

    public async updateBlueprint(
        em: EntityManager,
        id: number,
        data: UpdatePipelineBlueprintDto,
    ): Promise<PipelineBlueprintEntity> {
        const blueprint = await em.findOneOrFail(PipelineBlueprintEntity, { id });

        em.assign(blueprint, data);
        blueprint.usedModules.removeAll();
        blueprint.usedModules.add(data.data.nodes.map((n) => em.getReference(PipelineModuleEntity, n.moduleId)));

        await em.flush();

        return blueprint;
    }

    public async findAllDatatable(
        em: EntityManager,
        listRequest: PaginatedListRequestDto<PipelineBlueprintDatatableDto>,
    ): Promise<PaginatedListResponseDto<PipelineBlueprintDatatableDto>> {
        const queryBuilder = em
            .createQueryBuilder(PipelineBlueprintEntity, 'blueprint')
            .select(['id', 'title', 'description', 'createdAt', 'updatedAt']);

        return this.datatableService.executeDataTableSearch<PipelineBlueprintEntity, PipelineBlueprintDatatableDto>(
            PipelineBlueprintEntity,
            {
                listRequest,
                queryBuilder,
                searchFilters: {
                    id: (queryBuilder, value) =>
                        queryBuilder.andWhere({
                            id: value,
                        }),
                },
                applySearchText: (searchText, queryBuilder) => {
                    queryBuilder.andWhere({
                        title: {
                            $ilike: `%${searchText}%`,
                        },
                    });
                },
            },
        );
    }
}
