import { DateTime } from 'luxon';
import type { Add, ASObject, Page, View } from '@bytebunker/event-schema';
import { createUnknownASType } from '@bytebunker/event-schema';
import type {
    BrowserBookmarkRecord,
    BrowserEnum,
    BrowserVisitRecord,
} from '@bytebunker/event-schema/extension/browser-history';
import type { ActivityDto } from '../../../../activity-graph/dto/activity.dto.js';
import type {
    BrowserBookmarkActivityInterface,
    BrowserPageObjectInterface,
    BrowserVisitActivityInterface,
} from '../type/browser-activity.interface.js';
import { bookmarkStableKey, normalizePageUrl, pageStableKey, visitStableKey } from './browser-url.util.js';

const FOLDER_PATH_SEPARATOR = ' > ';
/** Firefox scrapes whole paragraphs into `description`; a page node does not need more than this. */
const MAX_DESCRIPTION_LENGTH = 1000;

export interface BrowserActivityContext {
    generator: ASObject;
    actorId: string;
    browser?: BrowserEnum;
    profileName?: string;
    /** Only visits at or after / before these Unix microseconds (bookmarks are not filtered). */
    fromUs?: number;
    toUs?: number;
}

export interface BrowserImportStats {
    visitsRead: number;
    visitsImported: number;
    droppedRedirectSources: number;
    droppedReloads: number;
    droppedFramed: number;
    /** Browser-internal or unparseable URLs (about:, chrome://, moz-extension:, …). */
    skippedInternalUrls: number;
    outsideDateRange: number;
    /** Same normalised URL and millisecond twice in one file. */
    duplicateVisits: number;
    bookmarksRead: number;
    bookmarksImported: number;
    skippedBookmarkUrls: number;
    duplicateBookmarks: number;
    /** Rows without URL or usable timestamp, counted by the parsers. */
    invalidRows: number;
}

/**
 * Turns visit and bookmark records of one file into View/BrowserVisit and Add/Bookmark activities. Drops noise and
 * internal URLs, dedupes repeated keys inside the file and counts everything it drops.
 */
export class BrowserActivityBuilder {
    public readonly stats: BrowserImportStats = {
        visitsRead: 0,
        visitsImported: 0,
        droppedRedirectSources: 0,
        droppedReloads: 0,
        droppedFramed: 0,
        skippedInternalUrls: 0,
        outsideDateRange: 0,
        duplicateVisits: 0,
        bookmarksRead: 0,
        bookmarksImported: 0,
        skippedBookmarkUrls: 0,
        duplicateBookmarks: 0,
        invalidRows: 0,
    };

    public readonly activities: ActivityDto[] = [];
    private readonly seenKeys = new Set<string>();
    private readonly seenPages = new Set<string>();

    constructor(private readonly context: BrowserActivityContext) {}

    public addVisits(visits: BrowserVisitRecord[]): void {
        const { fromUs, toUs } = this.context;

        for (const visit of visits) {
            this.stats.visitsRead++;

            if (visit.noise) {
                const counter = NOISE_COUNTERS[visit.noise];
                this.stats[counter]++;
                continue;
            }

            if (
                (fromUs !== undefined && visit.visitTimeUs < fromUs) ||
                (toUs !== undefined && visit.visitTimeUs >= toUs)
            ) {
                this.stats.outsideDateRange++;
                continue;
            }

            const url = normalizePageUrl(visit.url);
            const startTime = toDateTime(visit.visitTimeUs);

            if (!url || !startTime) {
                this.stats.skippedInternalUrls += url ? 0 : 1;
                this.stats.invalidRows += url ? 1 : 0;
                continue;
            }

            const key = visitStableKey(url, visit.visitTimeUs);

            if (this.seenKeys.has(key)) {
                this.stats.duplicateVisits++;
                continue;
            }

            this.seenKeys.add(key);
            this.activities.push(this.buildVisit(visit, url, key, startTime) as unknown as ActivityDto);
            this.stats.visitsImported++;
        }
    }

    public addBookmarks(bookmarks: BrowserBookmarkRecord[]): void {
        for (const bookmark of bookmarks) {
            this.stats.bookmarksRead++;

            const url = normalizePageUrl(bookmark.url);
            const startTime = toDateTime(bookmark.dateAddedUs);

            if (!url) {
                this.stats.skippedBookmarkUrls++;
                continue;
            }

            if (!startTime) {
                this.stats.invalidRows++;
                continue;
            }

            const keys = [
                bookmarkStableKey(url, bookmark.dateAddedUs),
                // Firefox Sync keeps the GUID across profiles, also where dateAdded drifted.
                ...(bookmark.guid ? [`browser:bookmark:firefox:${bookmark.guid}`] : []),
            ];

            if (keys.some((key) => this.seenKeys.has(key))) {
                this.stats.duplicateBookmarks++;
                continue;
            }

            for (const key of keys) this.seenKeys.add(key);
            this.activities.push(this.buildBookmark(bookmark, url, keys, startTime) as unknown as ActivityDto);
            this.stats.bookmarksImported++;
        }
    }

    public summary(): string {
        return Object.entries(this.stats)
            .filter(([, value]) => value > 0)
            .map(([key, value]) => `${key}=${value}`)
            .join(' ');
    }

    private buildVisit(
        visit: BrowserVisitRecord,
        url: string,
        key: string,
        startTime: DateTime,
    ): View & BrowserVisitActivityInterface {
        const { browser, profileName } = this.context;
        const fromUrl = visit.fromUrl ? normalizePageUrl(visit.fromUrl) : undefined;

        return {
            '@type': 'View',
            '@secondaryTypes': [createUnknownASType('BrowserVisit')],
            generator: this.context.generator,
            stableKeys: [key],
            actor: { '@id': this.context.actorId, '@type': 'Person' },
            startTime,
            object: this.buildPage(url, visit.title, visit.description, visit.previewImageUrl),
            ...(browser ? { browser } : {}),
            ...(profileName ? { profileName } : {}),
            visitType: visit.visitType,
            ...(visit.transitionQualifiers ? { transition: visit.transitionQualifiers } : {}),
            ...(fromUrl ? { fromUrl } : {}),
            ...(visit.durationMs ? { durationMs: visit.durationMs } : {}),
        } satisfies View & BrowserVisitActivityInterface;
    }

    private buildBookmark(
        bookmark: BrowserBookmarkRecord,
        url: string,
        keys: string[],
        startTime: DateTime,
    ): Add & BrowserBookmarkActivityInterface {
        const { browser, profileName } = this.context;
        const lastModified = bookmark.lastModifiedUs ? toDateTime(bookmark.lastModifiedUs)?.toISO() : undefined;

        return {
            '@type': 'Add',
            '@secondaryTypes': [createUnknownASType('Bookmark')],
            generator: this.context.generator,
            stableKeys: keys,
            actor: { '@id': this.context.actorId, '@type': 'Person' },
            startTime,
            object: this.buildPage(url, bookmark.title),
            ...(browser ? { browser } : {}),
            ...(profileName ? { profileName } : {}),
            ...(bookmark.folderPath.length ? { folderPath: bookmark.folderPath.join(FOLDER_PATH_SEPARATOR) } : {}),
            ...(bookmark.title ? { bookmarkTitle: bookmark.title } : {}),
            ...(bookmark.keyword ? { keyword: bookmark.keyword } : {}),
            ...(bookmark.tags?.length ? { bookmarkTags: bookmark.tags.join(',') } : {}),
            ...(lastModified ? { lastModified } : {}),
        } satisfies Add & BrowserBookmarkActivityInterface;
    }

    private buildPage(
        url: string,
        title?: string,
        description?: string,
        previewImageUrl?: string,
    ): Page & BrowserPageObjectInterface {
        const stableKey = pageStableKey(url);

        if (this.seenPages.has(stableKey)) {
            return { '@type': 'Page', stableKeys: [stableKey] };
        }

        this.seenPages.add(stableKey);
        const trimmedDescription = description?.trim().slice(0, MAX_DESCRIPTION_LENGTH);

        return {
            '@type': 'Page',
            stableKeys: [stableKey],
            name: title?.trim() || url,
            pageUrl: url,
            ...(trimmedDescription ? { description: trimmedDescription } : {}),
            ...(previewImageUrl ? { previewImageUrl } : {}),
        };
    }
}

const NOISE_COUNTERS: Record<NonNullable<BrowserVisitRecord['noise']>, keyof BrowserImportStats> = {
    'redirect-source': 'droppedRedirectSources',
    reload: 'droppedReloads',
    framed: 'droppedFramed',
};

function toDateTime(unixUs: number): DateTime | undefined {
    if (!Number.isFinite(unixUs) || unixUs <= 0) {
        return undefined;
    }

    const dateTime = DateTime.fromMillis(Math.floor(unixUs / 1000), { zone: 'utc' });

    return dateTime.isValid ? dateTime : undefined;
}
