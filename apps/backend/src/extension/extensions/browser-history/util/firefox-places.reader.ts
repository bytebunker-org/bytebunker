// eslint-disable-next-line n/no-unsupported-features/node-builtins -- available unflagged since Node 22.13, prod runs 22.22
import type { DatabaseSync } from 'node:sqlite';
import {
    type BrowserBookmarkRecord,
    type BrowserVisitRecord,
    BrowserVisitTypeEnum,
} from '@bytebunker/event-schema/extension/browser-history';
import { hasColumn, hasTables } from './sqlite-file.util.js';

/** Firefox `nsINavHistoryService.TRANSITION_*` values as stored in `moz_historyvisits.visit_type`. */
const FIREFOX_VISIT_TYPES: Record<number, BrowserVisitTypeEnum> = {
    1: BrowserVisitTypeEnum.LINK,
    2: BrowserVisitTypeEnum.TYPED,
    3: BrowserVisitTypeEnum.BOOKMARK,
    4: BrowserVisitTypeEnum.FRAMED, // EMBED, normally not stored
    5: BrowserVisitTypeEnum.REDIRECT_PERMANENT,
    6: BrowserVisitTypeEnum.REDIRECT_TEMPORARY,
    7: BrowserVisitTypeEnum.DOWNLOAD,
    8: BrowserVisitTypeEnum.FRAMED, // FRAMED_LINK
    9: BrowserVisitTypeEnum.RELOAD,
};

const REDIRECT_VISIT_TYPES = '5, 6';

/** Display names of the built-in bookmark roots, keyed by their fixed GUIDs. */
const BOOKMARK_ROOT_NAMES: Record<string, string | null> = {
    root________: null,
    menu________: 'Bookmarks Menu',
    toolbar_____: 'Bookmarks Toolbar',
    unfiled_____: 'Other Bookmarks',
    mobile______: 'Mobile Bookmarks',
};
const TAGS_ROOT_GUID = 'tags________';

const BOOKMARK_TYPE_URL = 1;
const BOOKMARK_TYPE_FOLDER = 2;

interface VisitRow {
    visit_date: number;
    visit_type: number;
    url: string;
    title: string | null;
    description: string | null;
    preview_image_url: string | null;
    hidden: number;
    from_url: string | null;
    is_redirect_source: number;
}

interface BookmarkRow {
    id: number;
    parent: number;
    type: number;
    guid: string | null;
    title: string | null;
    dateAdded: number | null;
    lastModified: number | null;
    url: string | null;
    keyword: string | null;
    fk: number | null;
}

export function isFirefoxPlaces(db: DatabaseSync): boolean {
    return hasTables(db, 'moz_places', 'moz_historyvisits');
}

/**
 * Reads all visits of a Firefox `places.sqlite`, oldest first, and marks the noise the importer drops:
 *
 * - redirect sources: visits that redirected onwards (another visit of type 5/6 points at them via `from_visit`),
 *   and visits of pages Firefox itself hides (`moz_places.hidden`, set for pages only ever seen as redirect source or
 *   frame). The redirect *target* (visit types 5/6) is the page the user actually saw and is kept.
 * - reloads (type 9) and framed loads (types 4, 8).
 */
export function readFirefoxVisits(db: DatabaseSync): BrowserVisitRecord[] {
    const optionalColumn = (column: string) => (hasColumn(db, 'moz_places', column) ? `p.${column}` : 'NULL');

    const rows = db
        .prepare(
            `SELECT v.visit_date, v.visit_type, p.url, p.title, p.hidden,
                    ${optionalColumn('description')} AS description,
                    ${optionalColumn('preview_image_url')} AS preview_image_url,
                    fp.url AS from_url,
                    EXISTS (
                        SELECT 1 FROM moz_historyvisits r
                        WHERE r.from_visit = v.id AND r.visit_type IN (${REDIRECT_VISIT_TYPES})
                    ) AS is_redirect_source
             FROM moz_historyvisits v
             JOIN moz_places p ON p.id = v.place_id
             LEFT JOIN moz_historyvisits fv ON fv.id = v.from_visit AND v.from_visit > 0
             LEFT JOIN moz_places fp ON fp.id = fv.place_id
             ORDER BY v.visit_date, v.id`,
        )
        .all() as unknown as VisitRow[];

    return rows.map((row) => {
        const visitType = FIREFOX_VISIT_TYPES[row.visit_type] ?? BrowserVisitTypeEnum.UNKNOWN;
        const noise: BrowserVisitRecord['noise'] =
            visitType === BrowserVisitTypeEnum.RELOAD
                ? 'reload'
                : visitType === BrowserVisitTypeEnum.FRAMED
                  ? 'framed'
                  : row.is_redirect_source || row.hidden
                    ? 'redirect-source'
                    : undefined;

        return {
            url: row.url,
            ...(row.title ? { title: row.title } : {}),
            visitTimeUs: row.visit_date,
            visitType,
            ...(row.from_url ? { fromUrl: row.from_url } : {}),
            ...(row.description ? { description: row.description } : {}),
            ...(row.preview_image_url ? { previewImageUrl: row.preview_image_url } : {}),
            ...(noise ? { noise } : {}),
        } satisfies BrowserVisitRecord;
    });
}

/**
 * Reads URL bookmarks with their folder path. Tags are bookmarks inside a folder under the tags root (one folder per
 * tag); they are attached to the real bookmarks of the same page and not emitted on their own.
 */
export function readFirefoxBookmarks(db: DatabaseSync): BrowserBookmarkRecord[] {
    if (!hasTables(db, 'moz_bookmarks')) {
        return [];
    }

    const keywordJoin = hasTables(db, 'moz_keywords')
        ? `LEFT JOIN (SELECT place_id, MIN(keyword) AS keyword FROM moz_keywords GROUP BY place_id) k ON k.place_id = b.fk`
        : '';
    const rows = db
        .prepare(
            `SELECT b.id, b.parent, b.type, b.guid, b.title, b.dateAdded, b.lastModified, b.fk, p.url,
                    ${keywordJoin ? 'k.keyword' : 'NULL'} AS keyword
             FROM moz_bookmarks b
             LEFT JOIN moz_places p ON p.id = b.fk
             ${keywordJoin}
             ORDER BY b.dateAdded, b.id`,
        )
        .all() as unknown as BookmarkRow[];

    const folders = new Map(rows.filter((row) => row.type === BOOKMARK_TYPE_FOLDER).map((row) => [row.id, row]));
    const tagsRoot = rows.find((row) => row.guid === TAGS_ROOT_GUID);
    const isTagFolder = (id: number) => tagsRoot !== undefined && folders.get(id)?.parent === tagsRoot.id;

    const tagsByPlace = new Map<number, string[]>();

    for (const row of rows) {
        if (row.type === BOOKMARK_TYPE_URL && row.fk !== null && isTagFolder(row.parent)) {
            const tag = folders.get(row.parent)?.title;

            if (tag) {
                tagsByPlace.set(row.fk, [...(tagsByPlace.get(row.fk) ?? []), tag]);
            }
        }
    }

    const folderPathCache = new Map<number, string[]>();
    const folderPath = (folderId: number, depth = 0): string[] => {
        const cached = folderPathCache.get(folderId);

        if (cached) {
            return cached;
        }

        const folder = folders.get(folderId);

        // Depth guard against corrupt parent cycles.
        if (!folder || depth > 64) {
            return [];
        }

        const rootName = folder.guid ? BOOKMARK_ROOT_NAMES[folder.guid] : undefined;
        const name = rootName === undefined ? folder.title : rootName;
        const path = [...folderPath(folder.parent, depth + 1), ...(name ? [name] : [])];
        folderPathCache.set(folderId, path);

        return path;
    };

    return rows
        .filter((row) => row.type === BOOKMARK_TYPE_URL && row.url && row.dateAdded && !isTagFolder(row.parent))
        .map((row) => {
            const tags = row.fk === null ? undefined : tagsByPlace.get(row.fk);

            return {
                url: row.url!,
                ...(row.title ? { title: row.title } : {}),
                dateAddedUs: row.dateAdded!,
                ...(row.lastModified ? { lastModifiedUs: row.lastModified } : {}),
                folderPath: folderPath(row.parent),
                ...(row.keyword ? { keyword: row.keyword } : {}),
                ...(tags?.length ? { tags } : {}),
                ...(row.guid ? { guid: row.guid } : {}),
            } satisfies BrowserBookmarkRecord;
        });
}
