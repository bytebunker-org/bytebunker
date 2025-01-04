import { IsNotEmpty, IsObject, IsString, IsUrl } from 'class-validator';
import type { JSONSchema7 } from 'json-schema';
import { PARALO_SCHEMA_HOST } from '../json-schema.constant.js';
import { ApiProperty } from '@nestjs/swagger';
import exampleJsonSchema from '../util/example.schema.json.js';
import { TimestampDto } from '../../../database/util/timestamp.dto.js';

export class JsonSchemaDto extends TimestampDto {
    @IsUrl({
        protocols: ['https'],
        require_host: true,
        require_tld: true,
        disallow_auth: true,
        allow_fragments: false,
        allow_query_components: false,
        validate_length: true,
        host_whitelist: [PARALO_SCHEMA_HOST],
        require_valid_protocol: true,
    })
    @IsNotEmpty()
    public schemaUri!: string;

    @IsString()
    @IsNotEmpty()
    public title!: string;

    @IsString()
    public description!: string;

    @IsObject()
    @ApiProperty({
        type: () => Object,
        title: 'JSON Schema',
        example: exampleJsonSchema,
        externalDocs: { description: 'JSON Schema Homepage', url: 'https://json-schema.org/' },
    })
    public jsonSchema!: JSONSchema7;
}
