import type { Ajv, ValidateFunction } from 'ajv';
import { Inject, Injectable } from '@nestjs/common';
import { JsonSchemaService } from '../json-schema/json-schema.service.js';
import type { Cache } from 'cache-manager';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { ValidationResultDto } from './dto/validation-result.dto.js';
import { AJV_PROVIDER } from '../ajv/ajv.constant.js';
import { BadRequestError } from '../../util/rest-error.js';

@Injectable()
export class JsonSchemaValidationService {
    constructor(
        private readonly jsonSchemaService: JsonSchemaService,
        @Inject(AJV_PROVIDER) private readonly ajv: Ajv,
        @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    ) {}

    public async validate(schemaUri: string, object: unknown, fieldName: string): Promise<ValidationResultDto> {
        const validationFunction = await this.getValidationFunction(schemaUri);

        const valid = validationFunction(object);
        const errors = valid ? [] : [...validationFunction.errors!];

        return {
            success: valid,
            message: valid ? 'Valid' : this.ajv.errorsText(errors, { separator: '\n', dataVar: fieldName }),
            errors,
        };
    }

    public async validateOrThrow(schemaUri: string, object: unknown, fieldName: string): Promise<true> {
        const result = await this.validate(schemaUri, object, fieldName);

        if (!result.success) {
            const error = new BadRequestError(result.message);
            error.errors = result.errors;

            throw error;
        }

        return true;
    }

    private getValidationFunction<T = unknown>(schemaUri: string): Promise<ValidateFunction<T>> {
        schemaUri = this.jsonSchemaService.normalizeAndValidateInternalSchemaUri(schemaUri);

        return this.cacheManager.wrap(`validationFunc-${schemaUri}`, () => this.compileSchema(schemaUri));
    }

    private async compileSchema<T = unknown>(schemaUri: string): Promise<ValidateFunction<T>> {
        const schemaObject = await this.jsonSchemaService.loadSchema(schemaUri);

        return this.ajv.compileAsync<T>(schemaObject);
    }
}
