import { Test, TestingModule } from '@nestjs/testing';
import { ajvProvider } from './ajv.provider.js';
import { AJV_PROVIDER } from './ajv.constant.js';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Ajv } from 'ajv';

describe('Ajv', () => {
    let provider: Ajv;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [ajvProvider],
        }).compile();

        provider = module.get<Ajv>(AJV_PROVIDER);
    });

    it('should be defined', () => {
        expect(provider).toBeDefined();
    });
});
