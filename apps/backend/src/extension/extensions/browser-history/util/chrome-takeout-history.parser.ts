import {
    type BrowserVisitRecord,
    BrowserVisitTypeEnum,
    type ChromeTakeoutHistoryEntry,
    type ChromeTakeoutHistoryFile,
} from '@bytebunker/event-schema/extension/browser-history';
import { CHROME_TRANSITION_NAMES } from './chrome-history.reader.js';

export interface ChromeTakeoutHistoryParseResult {
    visits: BrowserVisitRecord[];
    /** Rows without url or a usable timestamp. */
    invalid: number;
}

/**
 * Parses Google Takeout `Chrome/Verlauf.json` / `Chrome/BrowserHistory.json` (the `Browser History` array, one row
 * per visit, `time_usec` in Unix microseconds). Older exports (2019/2020) carry the core transition in
 * `page_transition`; newer ones (2025) only `page_transition_qualifier`, which is CLIENT_REDIRECT on every row seen so
 * far and therefore not used to drop anything. The other top-level keys (`Typed Url`, `Session`) are ignored.
 */
export function parseChromeTakeoutHistory(json: string): ChromeTakeoutHistoryParseResult {
    const parsed = JSON.parse(json) as Partial<ChromeTakeoutHistoryFile>;
    const entries = parsed['Browser History'];

    if (!Array.isArray(entries)) {
        throw new TypeError('No "Browser History" array in Chrome Takeout history file');
    }

    const visits: BrowserVisitRecord[] = [];
    let invalid = 0;

    for (const entry of entries as Partial<ChromeTakeoutHistoryEntry>[]) {
        const time = Number(entry?.time_usec);

        if (!entry?.url || !Number.isFinite(time) || time <= 0) {
            invalid++;
            continue;
        }

        const visitType = entry.page_transition
            ? (CHROME_TRANSITION_NAMES[entry.page_transition.toUpperCase()] ?? BrowserVisitTypeEnum.UNKNOWN)
            : BrowserVisitTypeEnum.UNKNOWN;
        const noise: BrowserVisitRecord['noise'] =
            visitType === BrowserVisitTypeEnum.RELOAD
                ? 'reload'
                : visitType === BrowserVisitTypeEnum.FRAMED
                  ? 'framed'
                  : undefined;

        visits.push({
            url: entry.url,
            ...(entry.title ? { title: entry.title } : {}),
            visitTimeUs: time,
            visitType,
            ...(entry.page_transition_qualifier ? { transitionQualifiers: entry.page_transition_qualifier } : {}),
            ...(noise ? { noise } : {}),
        });
    }

    visits.sort((a, b) => a.visitTimeUs - b.visitTimeUs);

    return { visits, invalid };
}
