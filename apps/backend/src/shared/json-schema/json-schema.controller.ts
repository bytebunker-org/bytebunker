import { Body, Controller, Get, Header, HttpCode, Put, Req } from '@nestjs/common';
import type { JSONSchema7 } from 'json-schema';
import { JsonSchemaService } from './json-schema.service.js';
import { StoreJsonSchemaRequestDto } from './dto/store-json-schema-request.dto.js';
import { FindAllJsonSchemaResponseDto } from './dto/find-all-json-schema-response.dto.js';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import exampleJsonSchema from './util/example.schema.json.js';
import type { Request } from 'express';

@ApiTags('json-schema')
@Controller('schema')
export class JsonSchemaController {
    constructor(private readonly jsonSchemaService: JsonSchemaService) {}

    @Get('/')
    public findAll(): Promise<FindAllJsonSchemaResponseDto[]> {
        return this.jsonSchemaService.findAll();
    }

    @Get('/*')
    @Header('Cache-Control', 'public, max-age=604800')
    @Header('Content-Type', 'application/schema+json')
    @ApiResponse({
        status: 200,
        type: Object,
        description: 'JSON Schema',
        content: {
            'application/schema+json': {
                example: exampleJsonSchema,
            },
        },
    })
    public get(@Req() request: Request): Promise<JSONSchema7> {
        const schemaUri = request.url.slice('/'.length);

        return this.jsonSchemaService.getSchema(schemaUri);
    }

    @Get('/multiple/*')
    @ApiResponse({
        status: 200,
        type: [Object],
        description: 'An array of all json schemas with a schema uri/$id matching the given prefix',
        content: {
            'application/json': {
                example: [exampleJsonSchema],
            },
        },
    })
    public getMultiple(@Req() request: Request): Promise<JSONSchema7[]> {
        const schemaUriPrefix = request.url.slice('/multiple/'.length);

        return this.jsonSchemaService.getMultipleSchemas(schemaUriPrefix);
    }

    @Put()
    @HttpCode(201)
    public storeMultiple(@Body() data: StoreJsonSchemaRequestDto): Promise<void> {
        return this.jsonSchemaService.storeMultiple(data);
    }
}
