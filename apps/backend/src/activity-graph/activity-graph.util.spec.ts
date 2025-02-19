import { describe, expect, it } from 'vitest';
import { extractASObjectId } from './activity-graph.util.js';
import { v4 as uuidV4 } from 'uuid';

describe('extractASObjectId', () => {
    it('should return undefined for undefined input', () => {
        expect(extractASObjectId(undefined)).toBeUndefined();
    });

    it('should extract UUID from a path-like string', () => {
        const uuid = uuidV4();
        expect(extractASObjectId(`/person/${uuid}`)).toBe(uuid);
    });

    it('should return the UUID if the input is already a UUID', () => {
        const uuid = uuidV4();
        expect(extractASObjectId(uuid)).toBe(uuid);
    });

    it('should return undefined for invalid UUID', () => {
        expect(extractASObjectId('not-a-uuid')).toBeUndefined();
    });

    it('should return undefined for empty string', () => {
        expect(extractASObjectId('')).toBeUndefined();
    });

    it('should handle URLs with multiple segments', () => {
        const uuid = uuidV4();
        expect(extractASObjectId(`https://example.com/api/person/${uuid}`)).toBe(uuid);
    });

    it('should return undefined for UUID-like string that fails validation', () => {
        expect(extractASObjectId('123e4567-e89b-12d3-a456-42661417400g')).toBeUndefined();
    });
});
