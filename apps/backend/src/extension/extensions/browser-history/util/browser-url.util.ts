import { urlStableKey } from '../../../../activity-graph/util/page-stable-key.util.js';

/**
 * Identity of one visit: normalised URL + visit time in milliseconds. Milliseconds, not microseconds: Firefox Sync
 * stores visits it receives from another device rounded to the millisecond, so the same visit read from two synced
 * profiles only matches at that precision.
 */
export function visitStableKey(normalizedUrl: string, visitTimeUs: number): string {
    return urlStableKey('browser:visit:', normalizedUrl, `:${Math.floor(visitTimeUs / 1000)}`);
}

export function bookmarkStableKey(normalizedUrl: string, dateAddedUs: number): string {
    return urlStableKey('browser:bookmark:', normalizedUrl, `:${Math.floor(dateAddedUs / 1000)}`);
}

/**
 * Profile name from the original import path: the folder holding the database. Firefox profile folders carry a
 * random prefix (`h0f01llj.dev-edition-default`), which is dropped.
 */
export function profileNameFromPath(originalPath: string | undefined): string | undefined {
    const parts = originalPath?.replaceAll('\\', '/').split('/').filter(Boolean) ?? [];

    if (parts.length < 2) {
        return undefined;
    }

    const folder = parts.at(-2) ?? '';

    return folder.replace(/^[\da-z]{8}\./, '') || undefined;
}

export { normalizePageUrl, urlStableKey, pageStableKey } from '../../../../activity-graph/util/page-stable-key.util.js';
