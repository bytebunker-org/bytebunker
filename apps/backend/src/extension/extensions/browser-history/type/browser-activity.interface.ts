import type { BrowserEnum, BrowserVisitTypeEnum } from '@bytebunker/event-schema/extension/browser-history';

/**
 * type: Page (web page). Only the first reference to a page in one import carries the details; later references
 * are bare `{ '@type', stableKeys }` so the output stays small (the graph merges them into the same node).
 */
export interface BrowserPageObjectInterface {
    /** Normalised URL; not `url` because AS `url` expects a Link object. */
    pageUrl?: string;
    description?: string;
    previewImageUrl?: string;
}

/**
 * secondary type: BrowserVisit (activity type View)
 */
export interface BrowserVisitActivityInterface {
    browser?: BrowserEnum;
    /** Browser profile, from the module option or the folder the database was imported from. */
    profileName?: string;
    visitType: BrowserVisitTypeEnum;
    /** Chrome transition qualifiers, e.g. `FROM_ADDRESS_BAR,CHAIN_START,CHAIN_END`. */
    transition?: string;
    /** The page this visit was reached from, if the browser recorded it. */
    fromUrl?: string;
    durationMs?: number;
}

/**
 * secondary type: Bookmark (activity type Add)
 */
export interface BrowserBookmarkActivityInterface {
    browser?: BrowserEnum;
    profileName?: string;
    /** Folder path from the root, joined with ` > `. */
    folderPath?: string;
    bookmarkTitle?: string;
    keyword?: string;
    /** Comma separated; not `tags`, which AS reserves for Link/Object references. */
    bookmarkTags?: string;
    /** ISO timestamp of the bookmark's last modification. */
    lastModified?: string;
}
