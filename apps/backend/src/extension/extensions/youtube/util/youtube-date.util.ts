import { DateTime } from 'luxon';

const GERMAN_TIMESTAMP_PATTERN = /^(\d{2}\.\d{2}\.\d{4}),\s*(\d{2}:\d{2}:\d{2})\s*(MEZ|MESZ)$/;

/**
 * Parses German Takeout timestamps like `03.02.2025, 12:08:18 MEZ` or `03.07.2024, 12:08:18 MESZ`.
 * Google renders timestamps in the user's account timezone, which can be a *fixed* offset (MEZ
 * year-round) regardless of season — so we trust the explicit MEZ/MESZ suffix as a fixed UTC offset
 * rather than letting Luxon apply DST from Europe/Berlin.
 */
export function parseGermanTimestamp(raw: string): DateTime<true> | undefined {
    const match = GERMAN_TIMESTAMP_PATTERN.exec(raw.trim());

    if (!match) {
        return undefined;
    }

    const [, datePart, timePart, suffix] = match;
    const offset = suffix === 'MESZ' ? 'UTC+2' : 'UTC+1';
    const dt = DateTime.fromFormat(`${datePart} ${timePart}`, 'dd.LL.yyyy HH:mm:ss', { zone: offset });

    return dt.isValid ? dt : undefined;
}
