import { DateTime } from 'luxon';

export const DEFAULT_TIMEZONE = 'Europe/Berlin';

export function positiveOr(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

export function nonNegativeOr(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
}

/** The given IANA zone if luxon knows it, else an error naming it (a typo should fail the run, not shift every day). */
export function timezoneOr(value: unknown, fallback: string = DEFAULT_TIMEZONE): string {
    const timezone = typeof value === 'string' && value.trim() ? value.trim() : fallback;

    if (!DateTime.local().setZone(timezone).isValid) {
        throw new Error(`Unknown timezone "${timezone}"`);
    }

    return timezone;
}

export function round(value: number, digits = 1): number {
    const factor = 10 ** digits;

    return Math.round(value * factor) / factor;
}

export function formatCount(value: number): string {
    return value.toLocaleString('en-US');
}
