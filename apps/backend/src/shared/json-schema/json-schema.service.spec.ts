import { Test, TestingModule } from '@nestjs/testing';
import { JsonSchemaService } from './json-schema.service.js';
import { beforeEach, describe, it, expect } from 'vitest';

describe('JsonSchemaService', () => {
    let service: JsonSchemaService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [JsonSchemaService],
        }).compile();

        service = module.get<JsonSchemaService>(JsonSchemaService);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });
});
