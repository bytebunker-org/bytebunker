import type { Constructable } from '../../util/type/constructable.interface.js';
import { applyDecorators } from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { toHeaderCase } from 'js-convert-case';
import { FindRestApiCountResponseDto } from './dto/find-rest-api-count-response.dto.js';

export const ApiFindAllMethod = (dtoClass: Constructable) => {
    const entityName = toHeaderCase(dtoClass.name.endsWith('Dto') ? dtoClass.name.slice(0, -3) : dtoClass.name);

    return applyDecorators(
        ApiOperation({ summary: `Get all ${entityName} entities` }),
        ApiResponse({ status: 200, type: [dtoClass] }),
    );
};

export const ApiFindOneMethod = (dtoClass: Constructable, primaryKey = ['id']) => {
    const entityName = toHeaderCase(dtoClass.name.endsWith('Dto') ? dtoClass.name.slice(0, -3) : dtoClass.name);

    return applyDecorators(
        ApiOperation({ summary: `Get a ${entityName} entity by ${primaryKey.join(', ')}` }),
        ApiResponse({ status: 200, type: [dtoClass] }),
        ApiResponse({ status: 404, description: `${entityName} entity not found` }),
    );
};

export const ApiCountMethod = (dtoClass: Constructable) => {
    const entityName = toHeaderCase(dtoClass.name.endsWith('Dto') ? dtoClass.name.slice(0, -3) : dtoClass.name);

    return applyDecorators(
        ApiOperation({ summary: `Get the number of ${entityName} entities` }),
        ApiResponse({ status: 200, type: FindRestApiCountResponseDto }),
    );
};
