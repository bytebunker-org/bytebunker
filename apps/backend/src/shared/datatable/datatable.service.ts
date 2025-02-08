import { BadRequestError } from '../../util/rest-error.js';
import type { OrderColumnNameMap } from './datatable.type.js';
import { PaginatedListRequestDto } from './dto/paginated-list-request.dto.js';
import { Injectable, Logger } from '@nestjs/common';
import type { Constructable } from '../../util/type/constructable.interface.js';
import type { SelectQueryBuilder } from '@mikro-orm/postgresql';
import type { PaginatedListResponseDto } from './dto/paginated-list-response.dto.js';
import { serialize } from '@mikro-orm/core';

@Injectable()
export class DatatableService {
    private readonly logger = new Logger(DatatableService.name);

    constructor() {}

    public async executeDataTableSearch<Entity extends object, EntityDto>(
        entityClass: Constructable<Entity>,
        {
            listRequest,
            queryBuilder,
            orderColumnNameMap,
            searchFilters,
            applySearchText,
            useExtraFields = false,
            mapResults = true,
        }: {
            listRequest: PaginatedListRequestDto<EntityDto> | undefined;
            queryBuilder: SelectQueryBuilder<Entity>;
            orderColumnNameMap?: OrderColumnNameMap<EntityDto>;
            searchFilters?: Record<string, (queryBuilder: SelectQueryBuilder<Entity>, value: string) => void>;
            applySearchText?: (searchText: string, queryBuilder: SelectQueryBuilder<Entity>) => void;
            useExtraFields?: boolean;
            mapResults?: boolean;
        },
    ): Promise<PaginatedListResponseDto<EntityDto>> {
        if (listRequest) {
            if (listRequest.searchQuery) {
                if (listRequest.searchQuery.searchFilters?.length && searchFilters) {
                    for (const searchFilter of listRequest.searchQuery.searchFilters) {
                        if (!searchFilters[searchFilter.type]) {
                            throw new BadRequestError(
                                `Unknown search filter type '${
                                    searchFilter.type
                                }'. All available search filters: ${Object.keys(searchFilters).join(', ')}`,
                            );
                        }

                        if (!!searchFilter.value?.trim() && searchFilters[searchFilter.type]) {
                            searchFilters[searchFilter.type](queryBuilder, searchFilter.value);
                        }
                    }
                }

                if (listRequest.searchQuery.searchText && applySearchText) {
                    applySearchText(listRequest.searchQuery.searchText, queryBuilder);
                }
            }

            if (listRequest.orderBy && listRequest.orderBy.order) {
                if (orderColumnNameMap && orderColumnNameMap[listRequest.orderBy.column]) {
                    const columnName = orderColumnNameMap[listRequest.orderBy.column] as string;

                    queryBuilder.orderBy({
                        [columnName]: listRequest.orderBy.order.toUpperCase() as 'ASC' | 'DESC',
                    });
                } else {
                    queryBuilder.orderBy({
                        [listRequest.orderBy.column]: listRequest.orderBy.order.toUpperCase() as 'ASC' | 'DESC',
                    });
                }
            }
        }

        queryBuilder.offset(listRequest?.start ?? 0).limit(listRequest?.amount ?? 50);

        if (useExtraFields) {
            const [items, totalCount] = await Promise.all([
                queryBuilder.execute('all', mapResults),
                queryBuilder.getCount(),
            ]);
            // TODO: Cache count results

            return {
                totalCount,
                items: items as unknown as EntityDto[],
            };
        } else {
            const [items, totalCount] = await queryBuilder.getResultAndCount();

            return {
                totalCount,
                items: serialize(items, { forceObject: true, groups: ['datatable'] }) as unknown as EntityDto[],
            };
        }
    }
}
