import type { JSONSchema7 } from 'json-schema';
import { ArrayNotEmpty, IsArray, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import exampleJsonSchema from '../util/example.schema.json.js';

export class StoreJsonSchemaRequestDto {
    @IsUUID()
    public extensionId!: string;

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
