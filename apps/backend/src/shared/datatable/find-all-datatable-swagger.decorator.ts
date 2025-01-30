import type { Constructable } from '../../util/type/constructable.interface.js';
import { applyDecorators } from '@nestjs/common';
import { ApiExtraModels, ApiOperation, ApiQuery, ApiResponse, getSchemaPath } from '@nestjs/swagger';
import { toHeaderCase } from 'js-convert-case';
import { paginatedListResponseDtoSchema } from './dto/paginated-list-response.dto.js';
import { paginatedListRequestDtoParameters } from './dto/paginated-list-request.dto.js';
import type { JSONSchema7 } from 'json-schema';

export const ApiFindAllDatatableMethod = (dtoClass: Constructable) => {
    const entityName = toHeaderCase(dtoClass.name.endsWith('Dto') ? dtoClass.name.slice(0, -3) : dtoClass.name);

    return applyDecorators(
        ApiOperation({
            summary: `Get ${entityName}s for datatable`,
            parameters: [{ in: 'query', name: 'test' }],
        }),
        ...paginatedListRequestDtoParameters.map((param) => ApiQuery(param)),
        ApiExtraModels(dtoClass),
        ApiResponse({
            status: 200,
            schema: {
                allOf: [
                    paginatedListResponseDtoSchema,
                    {
                        properties: {
                            items: { type: 'array', items: { $ref: getSchemaPath(dtoClass) } },
                        },
                    },
                ],
            } satisfies JSONSchema7,
        }),
    );
};
