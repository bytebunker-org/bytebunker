import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import { ValidationResultDto } from './dto/validation-result.dto.js';
import { JsonSchemaValidationService } from './json-schema-validation.service.js';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@ApiTags('validation')
@Controller()
export class JsonSchemaValidationController {
    constructor(private readonly jsonSchemaValidationService: JsonSchemaValidationService) {}

    @Post('/validate/*')
    @ApiResponse({
        status: 200,
        type: ValidationResultDto,
        description: 'Result of validating the given object with the schema',
    })
    @HttpCode(200)
    public validate(@Req() request: Request, @Body() data: unknown): Promise<ValidationResultDto> {
        const schemaUri = request.url.slice('/validate/'.length);

        return this.jsonSchemaValidationService.validate(schemaUri, data, 'data');
    }
}
