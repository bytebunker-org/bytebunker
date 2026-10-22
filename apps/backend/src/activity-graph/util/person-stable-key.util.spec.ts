import { describe, expect, it } from 'vitest';
import { normalizeEmail, normalizePhoneNumber, personStableKeys } from './person-stable-key.util.js';

describe('person-stable-key.util', () => {
    it('normalizes phone numbers to E.164', () => {
        expect(normalizePhoneNumber('+49 (0)651 123-456')).toBe('+49651123456');
        expect(normalizePhoneNumber('0049 651 123456')).toBe('+49651123456');
        expect(normalizePhoneNumber('0651 123456')).toBe('+49651123456');
        expect(normalizePhoneNumber('tel:+1-555-123-4567')).toBe('+15551234567');
        expect(normalizePhoneNumber('112')).toBeUndefined();
        expect(normalizePhoneNumber('Hannah')).toBeUndefined();
    });

    it('normalizes emails', () => {
        expect(normalizeEmail('mailto:Jane.Doe@Example.com ')).toBe('jane.doe@example.com');
        expect(normalizeEmail('not an email')).toBeUndefined();
    });

    it('builds deduplicated keys from all identities', () => {
        expect(
            personStableKeys({
                myHubPersonId: 'p-1',
                emails: ['A@b.de', 'a@b.de', undefined],
                phones: ['0651 123456'],
                handles: [{ platform: 'Airbnb', id: '323180213' }, undefined],
            }),
        ).toEqual([
            'person:myhub:p-1',
            'person:email:a@b.de',
            'person:phone:+49651123456',
            'person:handle:airbnb:323180213',
        ]);
    });
});
