import { Test, TestingModule } from '@nestjs/testing';
import { JsonSchemaController } from './json-schema.controller.js';
import { beforeEach, describe, it, expect } from 'vitest';

describe('JsonSchemaController', () => {
    let controller: JsonSchemaController;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [JsonSchemaController],
        }).compile();

        controller = module.get<JsonSchemaController>(JsonSchemaController);
    });

    it('should be defined', () => {
        expect(controller).toBeDefined();
    });
});
