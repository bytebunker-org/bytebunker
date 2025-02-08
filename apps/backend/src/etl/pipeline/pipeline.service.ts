import { Injectable } from '@nestjs/common';
import { DatatableService } from '../../shared/datatable/datatable.service.js';
import type { EntityManager } from '@mikro-orm/postgresql';
import type { PaginatedListRequestDto } from '../../shared/datatable/dto/paginated-list-request.dto.js';
import type { PaginatedListResponseDto } from '../../shared/datatable/dto/paginated-list-response.dto.js';
import type { PipelineExecutionDatatableDto } from './dto/pipeline-execution-datatable.dto.js';
import { PipelineExecutionEntity } from './entity/pipeline-execution.entity.js';
import type { OrderColumnNameMap } from '../../shared/datatable/datatable.type.js';

@Injectable()
export class PipelineService {
    constructor(private readonly datatableService: DatatableService) {}

    public async findAllDatatable(
        em: EntityManager,
        listRequest: PaginatedListRequestDto<PipelineExecutionDatatableDto>,
    ): Promise<PaginatedListResponseDto<PipelineExecutionDatatableDto>> {
        const orderColumnNameMap: OrderColumnNameMap<PipelineExecutionDatatableDto> = {
            blueprintName: 'blueprint.title',
        };

        const queryBuilder = em
            .createQueryBuilder(PipelineExecutionEntity, 'pipeline')
            .select([
                'id',
                'executionStatus',
                'blueprint.title AS blueprintName',
                'latestErrorStatus',
                'latestErrorMessage',
                'createdAt',
                'updatedAt',
            ])
            .innerJoin('pipeline.blueprint', 'blueprint');

        const { items, totalCount } = await this.datatableService.executeDataTableSearch<
            PipelineExecutionEntity,
            PipelineExecutionDatatableDto
        >(PipelineExecutionEntity, {
            listRequest,
            queryBuilder,
            orderColumnNameMap,
            searchFilters: {
                id: (queryBuilder, value) =>
                    queryBuilder.andWhere({
                        id: Number.parseInt(value),
                    }),
            },
            applySearchText: (searchText, queryBuilder) => {
                queryBuilder.andWhere({
                    blueprint: {
                        title: {
                            $ilike: `%${searchText}%`,
                        },
                    },
                });
            },
            useExtraFields: true,
        });

        return {
            items,
            totalCount,
        };
    }
}
