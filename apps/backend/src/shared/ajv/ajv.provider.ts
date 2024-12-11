import type { FactoryProvider } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { AJV_PROVIDER } from './ajv.constant.js';
import { JsonSchemaService } from '../json-schema/json-schema.service.js';
import { Ajv } from 'ajv';

export const ajvProvider: FactoryProvider<Ajv> = {
    provide: AJV_PROVIDER,
    useFactory: (jsonSchemaService: JsonSchemaService) => {
        const logger = new Logger('SchemaValidation');

        return new Ajv({
            strict: true,
            addUsedSchema: false,
            allowUnionTypes: true,
            loadSchema: (schemaUri) => {
                return jsonSchemaService.loadSchema(schemaUri);
            },
            logger: logger,
        });
    },
    inject: [JsonSchemaService],
};
