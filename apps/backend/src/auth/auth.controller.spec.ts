import { AuthController } from './auth.controller.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { TestBed } from '@suites/unit';

describe('AuthController', () => {
    let controller: AuthController;

    beforeAll(async () => {
        const { unit } = await TestBed.solitary(AuthController).compile();

        controller = unit;
    });

    it('should be defined', () => {
        expect(controller).toBeDefined();
    });
});
