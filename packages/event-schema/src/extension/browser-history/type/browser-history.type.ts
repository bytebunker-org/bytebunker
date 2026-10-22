export enum BrowserEnum {
    FIREFOX = 'firefox',
    CHROME = 'chrome',
    CHROMIUM = 'chromium',
}

/**
 * How a page was reached, unified over Firefox `visit_type` and Chrome's core page transition. Values follow the
 * browsers' own constant names.
 */
export enum BrowserVisitTypeEnum {
    LINK = 'LINK',
    TYPED = 'TYPED',
    /** Firefox TRANSITION_BOOKMARK, Chrome AUTO_BOOKMARK. */
    BOOKMARK = 'BOOKMARK',
    /** Firefox only: the visit started a download. */
    DOWNLOAD = 'DOWNLOAD',
    /** Firefox: the page was the target of a permanent (301/308) redirect. */
    REDIRECT_PERMANENT = 'REDIRECT_PERMANENT',
    /** Firefox: the page was the target of a temporary (302/303/307) redirect. */
    REDIRECT_TEMPORARY = 'REDIRECT_TEMPORARY',
    GENERATED = 'GENERATED',
    AUTO_TOPLEVEL = 'AUTO_TOPLEVEL',
    FORM_SUBMIT = 'FORM_SUBMIT',
    KEYWORD = 'KEYWORD',
    KEYWORD_GENERATED = 'KEYWORD_GENERATED',
    /** Noise, dropped by the importer: Firefox TRANSITION_RELOAD, Chrome RELOAD. */
    RELOAD = 'RELOAD',
    /** Noise, dropped by the importer: Firefox FRAMED_LINK/EMBED, Chrome AUTO/MANUAL_SUBFRAME. */
    FRAMED = 'FRAMED',
    UNKNOWN = 'UNKNOWN',
}

/** One visit as read from a browser database or export, before it becomes an activity. */
export interface BrowserVisitRecord {
    url: string;
    title?: string;
    /** Unix epoch in microseconds (UTC). */
    visitTimeUs: number;
    visitType: BrowserVisitTypeEnum;
    /** Chrome transition qualifiers, e.g. `FROM_ADDRESS_BAR,CHAIN_START,CHAIN_END`. */
    transitionQualifiers?: string;
    /** URL of the visit this one came from (Firefox `from_visit`, Chrome `from_visit`), if recorded. */
    fromUrl?: string;
    /** Chrome `visit_duration`, in milliseconds. */
    durationMs?: number;
    /** Page description / preview image Firefox scraped from the page's meta tags. */
    description?: string;
    previewImageUrl?: string;
    /** True for redirect hops, reloads and framed loads; the importer drops these. */
    noise?: 'redirect-source' | 'reload' | 'framed';
}

/** One bookmark from Firefox `moz_bookmarks` or a Netscape bookmark HTML file. */
export interface BrowserBookmarkRecord {
    url: string;
    title?: string;
    /** Unix epoch in microseconds (UTC). */
    dateAddedUs: number;
    lastModifiedUs?: number;
    /** Folder names from the root down, e.g. `['Bookmarks Toolbar', 'Dev']`. */
    folderPath: string[];
    /** Firefox keyword (`moz_keywords`) or SHORTCUTURL. */
    keyword?: string;
    tags?: string[];
    /** Firefox bookmark GUID; synced bookmarks keep it across profiles. */
    guid?: string;
}

/** Row of `Browser History` in Google Takeout `Chrome/Verlauf.json` (DE) or `Chrome/BrowserHistory.json` (EN). */
export interface ChromeTakeoutHistoryEntry {
    url: string;
    title?: string;
    /** Unix epoch in microseconds. */
    time_usec: number;
    /** Core transition (2019/2020 exports): LINK, TYPED, RELOAD, ... */
    page_transition?: string;
    /** Newer exports (2025) carry only this; every row observed so far says CLIENT_REDIRECT. */
    page_transition_qualifier?: string;
    client_id?: string;
    favicon_url?: string;
}

export interface ChromeTakeoutHistoryFile {
    'Browser History': ChromeTakeoutHistoryEntry[];
}
