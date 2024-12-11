import type { JSONSchema7 } from 'json-schema';
import { ArrayNotEmpty, IsArray, IsUUID } from 'class-validator';
import type { Uuid } from '../../util/type/opaque.type.js';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import exampleJsonSchema from '../../util/example.schema.json.js';

export class StoreJsonSchemaRequestDto {
    @IsUUID()
    @ApiProperty({ type: String, example: '7e577e57-0123-4567-8900-000000000000', title: 'UUID' })
    public addonId!: Uuid;

    @IsArray()
    @ArrayNotEmpty()
    @Type(() => Object)
    @ApiProperty({
        type: () => [Object],
        title: 'JSON Schema Array',
        example: [exampleJsonSchema],
        externalDocs: { description: 'JSON Schema Homepage', url: 'https://json-schema.org/' },
    })
    public jsonSchemas!: JSONSchema7[];
}
