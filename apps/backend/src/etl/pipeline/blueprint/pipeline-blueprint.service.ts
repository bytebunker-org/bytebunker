import { Injectable } from '@nestjs/common';
import { type EntityManager, sql } from '@mikro-orm/postgresql';
import { PipelineBlueprintEntity } from './entity/pipeline-blueprint.entity.js';
import { DatatableService } from '../../../shared/datatable/datatable.service.js';
import type { PaginatedListRequestDto } from '../../../shared/datatable/dto/paginated-list-request.dto.js';
import type { PaginatedListResponseDto } from '../../../shared/datatable/dto/paginated-list-response.dto.js';
import type { PipelineBlueprintDatatableDto } from './dto/pipeline-blueprint-datatable.dto.js';

@Injectable()
export class PipelineBlueprintService {
    constructor(private readonly datatableService: DatatableService) {}

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
                            $ilike: sql`%
                            ${searchText}
                            %`,
                        },
                    });
                },
            },
        );
    }
}
