import { IsArray, IsInt, IsObject, IsPositive, ValidateNested } from 'class-validator';
import type { JSONSchema7 } from 'json-schema';

export class PaginatedListResponseDto<Data> {
    @IsInt()
    @IsPositive()
    public totalCount!: number;

    @IsArray()
    @IsObject({ each: true })
    @ValidateNested({ each: true })
    public items!: Data[];
}

export const paginatedListResponseDtoSchema = {
    $id: 'https://schema.bytebunker.dev/core/api/paginated-list-response.schema.json',
    $schema: 'http://json-schema.org/draft-07/schema',
    type: 'object',
    title: 'PaginatedListResponseDto',
    properties: {
        totalCount: {
            type: 'number',
            minimum: 0,
        },
    },
    required: ['totalCount', 'items'],
} satisfies JSONSchema7;
