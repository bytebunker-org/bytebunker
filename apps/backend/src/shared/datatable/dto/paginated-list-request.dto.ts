import { ApiProperty } from '@nestjs/swagger';
import {
    IsArray,
    IsBoolean,
    IsEnum,
    IsInt,
    IsNotEmpty,
    IsObject,
    IsOptional,
    IsPositive,
    IsString,
    Max,
    Min,
    ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import type { ParameterObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface.js';

export class SearchFilterDto<SearchFilterType extends string = string> {
    @IsString()
    @IsNotEmpty()
    @ApiProperty({ type: String })
    public type!: SearchFilterType;

    @IsString()
    public value!: string;
}

export class ParsedSearchQueryDto<SearchCategory extends string = string, SearchFilterType extends string = string> {
    /**
     * Any text to search for in each item
     */
    @IsString()
    public searchText!: string;

    /**
     * A list of categories to include items from
     */
    @IsOptional()
    @IsArray()
    @Type(() => String)
    @IsString({ each: true })
    @IsNotEmpty({ each: true })
    @ApiProperty({ type: [String] })
    @Transform(({ value }) => value ?? [])
    public searchCategories?: SearchCategory[];

    /**
     * A list of filters, which each have a type and a value, to filter the resulting items with
     */
    @ApiProperty({ type: [SearchFilterDto] })
    @IsOptional()
    @IsArray()
    @Type(() => SearchFilterDto)
    @IsObject({ each: true })
    @ValidateNested({ each: true })
    @Transform(({ value }) => value ?? [])
    public searchFilters?: SearchFilterDto<SearchFilterType>[];

    /**
     * If a global search box is used, this can reset back to full global search, instead of inferring a category from for example a currently shown datatable
     */
    @IsOptional()
    @IsBoolean()
    public forceGlobalSearch?: boolean;
}

enum ColumnOrderEnum {
    ASC = 'asc',
    DESC = 'desc',
}

export class PaginatedListRequestOrderByDto<Data> {
    @IsString()
    public column!: keyof Data & string;

    @IsEnum(ColumnOrderEnum)
    public order!: ColumnOrderEnum | 'asc' | 'desc';
}

/**
 * Request data which is sent by the datatable when it is first loaded or the used changed the page, searched or sorted a column
 */
export class PaginatedListRequestDto<Data> {
    @IsInt()
    @Min(0)
    public start!: number;

    @IsInt()
    @IsPositive()
    @Max(200)
    public amount!: number;

    @IsOptional()
    @IsObject()
    @ValidateNested()
    public orderBy?: PaginatedListRequestOrderByDto<Data>;

    @IsString()
    public rawSearchQuery!: string;

    @IsObject()
    @ValidateNested()
    public searchQuery!: ParsedSearchQueryDto;
}

export const paginatedListRequestDtoParameters: ParameterObject[] = [
    {
        name: 'start',
        in: 'query',
        description: 'The starting index for pagination.',
        required: true,
        schema: { type: 'integer', minimum: 0 },
        example: 0,
    },
    {
        name: 'amount',
        in: 'query',
        description: 'The number of items to retrieve (max 200).',
        required: true,
        schema: { type: 'integer', minimum: 1, maximum: 200 },
        example: 50,
    },
    {
        name: 'orderBy',
        in: 'query',
        description: 'The column to sort by.',
        required: false,
        style: 'deepObject',
        schema: {
            type: 'object',
            properties: {
                column: { type: 'string', example: 'createdAt' },
                order: { type: 'string', enum: ['asc', 'desc'] },
            },
        },
    },
    {
        name: 'rawSearchQuery',
        in: 'query',
        description: 'The raw search query string.',
        required: true,
        schema: { type: 'string' },
        example: 'test search',
    },
    {
        name: 'searchQuery',
        in: 'query',
        description: 'The text to search for in items.',
        required: true,
        style: 'deepObject',
        schema: {
            type: 'object',
            properties: {
                searchText: {
                    type: 'string',
                    example: 'example search text',
                    description: 'Any text to search for in each item',
                },
                searchCategories: {
                    type: 'array',
                    description: 'A list of categories to include items from',
                    items: { type: 'string', example: 'some-category' },
                },
                searchFilters: {
                    type: 'array',
                    description:
                        'A list of filters, which each have a type and a value, to filter the resulting items with',
                    items: {
                        type: 'object',
                        properties: {
                            type: { type: 'string', example: 'id' },
                            value: { type: 'string', example: '2' },
                        },
                        required: ['type', 'value'],
                        additionalProperties: false,
                    },
                },
                forceGlobalSearch: {
                    type: 'boolean',
                    description:
                        'If a global search box is used, this can reset back to full global search, instead of inferring a category from for example a currently shown datatable',
                    default: false,
                },
            },
            required: ['searchText'],
            additionalProperties: false,
        },
    },
];
