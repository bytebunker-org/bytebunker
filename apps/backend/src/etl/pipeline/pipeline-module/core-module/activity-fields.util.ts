import type { ActivityDto } from '../../../../activity-graph/dto/activity.dto.js';

/** Update the progress bar every this many activities; reporting per row would be wasteful. */
export const PROGRESS_INTERVAL = 1000;

/** Epoch milliseconds of `startTime`, or undefined if absent or unparseable. Activities arrive as JSON, so it is a string. */
export function activityStartMs(activity: ActivityDto): number | undefined {
    const startTime = (activity as unknown as { startTime?: unknown }).startTime;

    if (typeof startTime !== 'string' && typeof startTime !== 'number') {
        return undefined;
    }

    const ms = new Date(startTime).getTime();

    return Number.isNaN(ms) ? undefined : ms;
}

/** `@type` and `@secondaryTypes` together. */
export function activityTypes(activity: ActivityDto): string[] {
    return [String(activity['@type']), ...(activity['@secondaryTypes'] ?? []).map(String)];
}

export function parseIsoDate(name: string, value: string | undefined): number | undefined {
    if (value === undefined || value === '') {
        return undefined;
    }

    const ms = new Date(value).getTime();

    if (Number.isNaN(ms)) {
        throw new TypeError(`${name} is not a valid ISO date: "${value}"`);
    }

    return ms;
}
