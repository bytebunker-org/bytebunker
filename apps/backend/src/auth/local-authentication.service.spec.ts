import { beforeAll, describe, expect, it } from 'vitest';
import { LocalAuthenticationService } from './local-authentication.service.js';
import { TestBed } from '@suites/unit';

describe('LocalAuthenticationService', () => {
    let service: LocalAuthenticationService;

    beforeAll(async () => {
        const { unit } = await TestBed.solitary(LocalAuthenticationService).compile();

        service = unit;
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });
});
