import { IsNotEmpty, IsObject, IsString, IsUrl, ValidateNested } from 'class-validator';
import type { JSONSchema7 } from 'json-schema';
import { BYTEBUNKER_SCHEMA_HOST } from '../json-schema.constant.js';
import { ApiProperty } from '@nestjs/swagger';
import exampleJsonSchema from '../util/example.schema.json.js';
import { TimestampDto } from '../../../database/util/timestamp.dto.js';
import type { DtoRef } from '../../../util/type/dto-ref.type.js';
import { ExtensionDto } from '../../../extension/dto/extension.dto.js';
import { Type } from 'class-transformer';
import { type Opt, PrimaryKeyProp } from '@mikro-orm/core';

export class JsonSchemaDto extends TimestampDto {
    [PrimaryKeyProp]?: 'schemaUri';

    @IsUrl({
        protocols: ['https'],
        require_host: true,
        require_tld: true,
        disallow_auth: true,
        allow_fragments: false,
        allow_query_components: false,
        validate_length: true,
        host_whitelist: [BYTEBUNKER_SCHEMA_HOST],
        require_valid_protocol: true,
    })
    @IsNotEmpty()
    public schemaUri!: string;

    @IsString()
    @IsNotEmpty()
    public title!: string;

    @IsString()
    public description!: string & Opt;

    @IsObject()
    @ApiProperty({
        type: () => Object,
        title: 'JSON Schema',
        example: exampleJsonSchema,
        externalDocs: { description: 'JSON Schema Homepage', url: 'https://json-schema.org/' },
    })
    public jsonSchema!: JSONSchema7;

    @Type(() => ExtensionDto)
    @IsObject()
    @ValidateNested()
    public extension!: DtoRef<ExtensionDto>;
}
