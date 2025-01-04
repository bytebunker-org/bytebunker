import { Module } from '@nestjs/common';
import { JsonSchemaService } from './json-schema.service.js';
import { JsonSchemaController } from './json-schema.controller.js';
import { HttpModule } from '@nestjs/axios';
import { CacheModule } from '@nestjs/cache-manager';

@Module({
    imports: [
        HttpModule,
        CacheModule.register({
            ttl: 1000 * 60 * 10,
            max: 1000,
        }),
    ],
    controllers: [JsonSchemaController],
    providers: [JsonSchemaService],
    exports: [JsonSchemaService],
})
export class JsonSchemaModule {}
