// eslint-disable-next-line n/no-unsupported-features/node-builtins -- available unflagged since Node 22.13, prod runs 22.22
import type { DatabaseSync } from 'node:sqlite';
import { type BrowserVisitRecord, BrowserVisitTypeEnum } from '@bytebunker/event-schema/extension/browser-history';
import { hasTables } from './sqlite-file.util.js';

/** Microseconds between 1601-01-01 (WebKit/Windows epoch) and 1970-01-01. */
export const WEBKIT_EPOCH_OFFSET_US = 11_644_473_600_000_000;

/** Chrome `ui::PageTransition` core types (lowest byte of `visits.transition`). */
const CHROME_CORE_TRANSITIONS: Record<number, BrowserVisitTypeEnum> = {
    0: BrowserVisitTypeEnum.LINK,
    1: BrowserVisitTypeEnum.TYPED,
    2: BrowserVisitTypeEnum.BOOKMARK, // AUTO_BOOKMARK
    3: BrowserVisitTypeEnum.FRAMED, // AUTO_SUBFRAME
    4: BrowserVisitTypeEnum.FRAMED, // MANUAL_SUBFRAME
    5: BrowserVisitTypeEnum.GENERATED,
    6: BrowserVisitTypeEnum.AUTO_TOPLEVEL,
    7: BrowserVisitTypeEnum.FORM_SUBMIT,
    8: BrowserVisitTypeEnum.RELOAD,
    9: BrowserVisitTypeEnum.KEYWORD,
    10: BrowserVisitTypeEnum.KEYWORD_GENERATED,
};

const CHROME_QUALIFIERS: [number, string][] = [
    [0x00_80_00_00, 'BLOCKED'],
    [0x01_00_00_00, 'FORWARD_BACK'],
    [0x02_00_00_00, 'FROM_ADDRESS_BAR'],
    [0x04_00_00_00, 'HOME_PAGE'],
    [0x08_00_00_00, 'FROM_API'],
    [0x10_00_00_00, 'CHAIN_START'],
    [0x20_00_00_00, 'CHAIN_END'],
    [0x40_00_00_00, 'CLIENT_REDIRECT'],
    [0x80_00_00_00, 'SERVER_REDIRECT'],
];
/** Lowest byte: the core transition. */
const CORE_TRANSITION_MASK = 255;
const CHAIN_START = 0x10_00_00_00;
const CHAIN_END = 0x20_00_00_00;

/** Map a Chrome core transition name (Takeout `page_transition`) to the shared visit type. */
export const CHROME_TRANSITION_NAMES: Record<string, BrowserVisitTypeEnum> = {
    LINK: BrowserVisitTypeEnum.LINK,
    TYPED: BrowserVisitTypeEnum.TYPED,
    AUTO_BOOKMARK: BrowserVisitTypeEnum.BOOKMARK,
    AUTO_SUBFRAME: BrowserVisitTypeEnum.FRAMED,
    MANUAL_SUBFRAME: BrowserVisitTypeEnum.FRAMED,
    GENERATED: BrowserVisitTypeEnum.GENERATED,
    AUTO_TOPLEVEL: BrowserVisitTypeEnum.AUTO_TOPLEVEL,
    FORM_SUBMIT: BrowserVisitTypeEnum.FORM_SUBMIT,
    RELOAD: BrowserVisitTypeEnum.RELOAD,
    KEYWORD: BrowserVisitTypeEnum.KEYWORD,
    KEYWORD_GENERATED: BrowserVisitTypeEnum.KEYWORD_GENERATED,
};

interface ChromeVisitRow {
    visit_time_us: number;
    transition: number;
    visit_duration: number | null;
    url: string;
    title: string | null;
    from_url: string | null;
}

export function isChromeHistory(db: DatabaseSync): boolean {
    return hasTables(db, 'urls', 'visits');
}

export function describeChromeQualifiers(transition: number): string | undefined {
    const names = CHROME_QUALIFIERS.filter(([bit]) => (transition & bit) !== 0).map(([, name]) => name);

    return names.length ? names.join(',') : undefined;
}

/** Same noise rules as Firefox: drop reloads, subframes and every redirect hop except the chain end. */
export function chromeTransitionNoise(transition: number): BrowserVisitRecord['noise'] {
    const core = CHROME_CORE_TRANSITIONS[transition & CORE_TRANSITION_MASK];

    if (core === BrowserVisitTypeEnum.RELOAD) {
        return 'reload';
    }

    if (core === BrowserVisitTypeEnum.FRAMED) {
        return 'framed';
    }

    // Visits without chain flags (some synced rows) are kept; inside a chain only the end is the page that was shown.
    if ((transition & (CHAIN_START | CHAIN_END)) !== 0 && (transition & CHAIN_END) === 0) {
        return 'redirect-source';
    }

    return undefined;
}

/**
 * Reads all visits of a Chrome/Chromium `History` database, oldest first. Times are WebKit microseconds (since 1601);
 * they exceed `Number.MAX_SAFE_INTEGER`, so the conversion to Unix microseconds happens in SQL.
 */
export function readChromeVisits(db: DatabaseSync): BrowserVisitRecord[] {
    const rows = db
        .prepare(
            `SELECT v.visit_time - ${WEBKIT_EPOCH_OFFSET_US} AS visit_time_us, v.transition, v.visit_duration,
                    u.url, u.title, fu.url AS from_url
             FROM visits v
             JOIN urls u ON u.id = v.url
             LEFT JOIN visits fv ON fv.id = v.from_visit AND v.from_visit > 0
             LEFT JOIN urls fu ON fu.id = fv.url
             ORDER BY v.visit_time, v.id`,
        )
        .all() as unknown as ChromeVisitRow[];

    return rows.map((row) => {
        // Stored as signed 32-bit integer; SERVER_REDIRECT is the sign bit.
        const transition = row.transition >>> 0;
        const noise = chromeTransitionNoise(transition);
        const qualifiers = describeChromeQualifiers(transition);
        const durationMs = row.visit_duration ? Math.round(row.visit_duration / 1000) : 0;

        return {
            url: row.url,
            ...(row.title ? { title: row.title } : {}),
            visitTimeUs: row.visit_time_us,
            visitType: CHROME_CORE_TRANSITIONS[transition & CORE_TRANSITION_MASK] ?? BrowserVisitTypeEnum.UNKNOWN,
            ...(qualifiers ? { transitionQualifiers: qualifiers } : {}),
            ...(row.from_url ? { fromUrl: row.from_url } : {}),
            ...(durationMs > 0 ? { durationMs } : {}),
            ...(noise ? { noise } : {}),
        } satisfies BrowserVisitRecord;
    });
}
