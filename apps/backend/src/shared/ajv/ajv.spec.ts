import { Test, TestingModule } from '@nestjs/testing';
import { ajvProvider } from './ajv.provider.js';
import { AJV_PROVIDER } from './ajv.constant.js';
import type { AjvType } from '../../util/type/ajv.type.js';
import { beforeEach, describe, expect, it } from 'vitest';

describe('Ajv', () => {
    let provider: AjvType;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [ajvProvider],
        }).compile();

        provider = module.get<AjvType>(AJV_PROVIDER);
    });

    it('should be defined', () => {
        expect(provider).toBeDefined();
    });
});
