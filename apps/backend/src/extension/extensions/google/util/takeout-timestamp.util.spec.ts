import { describe, expect, it } from 'vitest';
import { parseTakeoutTimestamp } from './takeout-timestamp.util.js';

const utc = (raw: string): string | null | undefined => parseTakeoutTimestamp(raw)?.toUTC().toISO();

describe('parseTakeoutTimestamp', () => {
    it('parses German MEZ/MESZ as fixed offsets', () => {
        expect(utc('03.02.2025, 12:08:18 MEZ')).toBe('2025-02-03T11:08:18.000Z');
        expect(utc('15.07.2024, 18:30:00 MESZ')).toBe('2024-07-15T16:30:00.000Z');
        // Google prints MEZ year-round when the account zone is fixed.
        expect(utc('08.08.2014, 21:42:07 MEZ')).toBe('2014-08-08T20:42:07.000Z');
    });

    it('keeps the printed offset', () => {
        expect(parseTakeoutTimestamp('03.02.2025, 12:08:18 MEZ')?.toISO()).toBe('2025-02-03T12:08:18.000+01:00');
    });

    it('parses en-US with plain, no-break and narrow no-break spaces', () => {
        expect(utc('Jul 2, 2020, 4:34:53 AM CEST')).toBe('2020-07-02T02:34:53.000Z');
        expect(utc('Jan 6, 2020, 12:46:14 PM CEST')).toBe('2020-01-06T10:46:14.000Z');
        expect(utc('Jan 6, 2020, 12:05:00 AM CET')).toBe('2020-01-05T23:05:00.000Z');
        // Next two: U+202F before PM, U+00A0 after the month.
        expect(utc('Feb 3, 2025, 12:08:18 PM CET')).toBe('2025-02-03T11:08:18.000Z');
        expect(utc('Feb 3, 2025, 1:08:18 PM PST')).toBe('2025-02-03T21:08:18.000Z');
    });

    it('parses en-GB 24 h and GMT offsets', () => {
        expect(utc('3 Feb 2025, 12:08:18 CET')).toBe('2025-02-03T11:08:18.000Z');
        expect(utc('3 Feb 2025, 12:08:18 UTC')).toBe('2025-02-03T12:08:18.000Z');
        expect(utc('Feb 3, 2025, 12:08:18 PM GMT+05:30')).toBe('2025-02-03T06:38:18.000Z');
    });

    it('rejects anything else', () => {
        expect(parseTakeoutTimestamp('garbage')).toBeUndefined();
        expect(parseTakeoutTimestamp('03.02.2025, 12:08:18 XYZT')).toBeUndefined();
        expect(parseTakeoutTimestamp('Feb 30, 2025, 12:08:18 PM CET')).toBeUndefined();
        expect(parseTakeoutTimestamp('Feb 3, 2025, 13:08:18 PM CET')).toBeUndefined();
    });
});
