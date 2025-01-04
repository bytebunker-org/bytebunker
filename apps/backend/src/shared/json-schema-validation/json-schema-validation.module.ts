import { Module } from '@nestjs/common';
import { JsonSchemaValidationService } from './json-schema-validation.service.js';
import { JsonSchemaModule } from '../json-schema/json-schema.module.js';
import { CacheModule } from '@nestjs/cache-manager';
import { JsonSchemaValidationController } from './json-schema-validation.controller.js';
import { AjvModule } from '../ajv/ajv.module.js';

@Module({
    imports: [
        JsonSchemaModule,
        AjvModule,
        CacheModule.register({
            ttl: 1000 * 60 * 10,
            max: 1000,
            isCacheableValue: () => true,
        }),
    ],
    controllers: [JsonSchemaValidationController],
    providers: [JsonSchemaValidationService],
    exports: [JsonSchemaValidationService],
})
export class JsonSchemaValidationModule {}
