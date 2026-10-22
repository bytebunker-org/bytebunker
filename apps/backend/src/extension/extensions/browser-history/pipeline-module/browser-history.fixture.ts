import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
// eslint-disable-next-line n/no-unsupported-features/node-builtins -- available unflagged since Node 22.13, prod runs 22.22
import { DatabaseSync } from 'node:sqlite';
import type { ASObject } from '@bytebunker/event-schema';
import type { AssetService } from '../../../../etl/asset/asset.service.js';
import type { ActivityGraphService } from '../../../../activity-graph/activity-graph.service.js';
import type { ActivityGraphNodeService } from '../../../../activity-graph/activity-graph-node.service.js';
import type { AssetDto } from '../../../../etl/asset/dto/asset.dto.js';

export const FAKE_ACTOR_ID = '00000000-0000-0000-0000-0000000000aa';
export const FAKE_GENERATOR: ASObject = {
    '@id': 'extension/browser-history',
    '@type': 'Application',
    name: 'browser-history',
};

/** Service stubs for the modules; `content` is what the asset service returns for any asset. */
export function createServiceStubs() {
    const stubs = {
        content: '' as string | Buffer,
        assetService: {
            getAsset: () => Promise.resolve(Buffer.from(stubs.content)),
            getAssetString: () => Promise.resolve(stubs.content.toString()),
        } as unknown as AssetService,
        graphService: {
            getOwnerActor: () => Promise.resolve({ get: (key: string) => (key === 'id' ? FAKE_ACTOR_ID : undefined) }),
        } as unknown as ActivityGraphService,
        graphNodeService: {
            getExtension: () => Promise.resolve(FAKE_GENERATOR),
        } as unknown as ActivityGraphNodeService,
    };

    return stubs;
}

export function fakeAsset(originalPath: string): AssetDto {
    return {
        originalFilename: originalPath.slice(originalPath.lastIndexOf('/') + 1),
        metadata: { 'Original-File-Path': originalPath },
    } as unknown as AssetDto;
}

/** What store-activity receives: the engine stores module output as JSON (luxon DateTimes become ISO strings). */
export function asStored<T>(value: unknown): T {
    // eslint-disable-next-line unicorn/prefer-structured-clone -- the JSON round trip is the point
    return JSON.parse(JSON.stringify(value)) as T;
}

/** 2025-03-01T10:00:00.123456Z in Unix microseconds. */
export const T0_US = 1_740_823_200_123_456;
const WEBKIT_EPOCH_OFFSET_US = 11_644_473_600_000_000n;

/** Relevant subset of the real Firefox places.sqlite schema (Firefox 130+). */
const FIREFOX_SCHEMA = `
CREATE TABLE moz_places (id INTEGER PRIMARY KEY, url LONGVARCHAR, title LONGVARCHAR, rev_host LONGVARCHAR,
    visit_count INTEGER DEFAULT 0, hidden INTEGER DEFAULT 0 NOT NULL, typed INTEGER DEFAULT 0 NOT NULL,
    frecency INTEGER DEFAULT -1 NOT NULL, last_visit_date INTEGER, guid TEXT, foreign_count INTEGER DEFAULT 0 NOT NULL,
    url_hash INTEGER DEFAULT 0 NOT NULL, description TEXT, preview_image_url TEXT, site_name TEXT, origin_id INTEGER);
CREATE TABLE moz_historyvisits (id INTEGER PRIMARY KEY, from_visit INTEGER, place_id INTEGER, visit_date INTEGER,
    visit_type INTEGER, session INTEGER, source INTEGER DEFAULT 0 NOT NULL, triggeringPlaceId INTEGER);
CREATE INDEX moz_historyvisits_fromindex ON moz_historyvisits (from_visit);
CREATE TABLE moz_bookmarks (id INTEGER PRIMARY KEY, type INTEGER, fk INTEGER DEFAULT NULL, parent INTEGER,
    position INTEGER, title LONGVARCHAR, keyword_id INTEGER, folder_type TEXT, dateAdded INTEGER, lastModified INTEGER,
    guid TEXT, syncStatus INTEGER NOT NULL DEFAULT 0, syncChangeCounter INTEGER NOT NULL DEFAULT 1);
CREATE TABLE moz_keywords (id INTEGER PRIMARY KEY AUTOINCREMENT, keyword TEXT UNIQUE, place_id INTEGER, post_data TEXT);
`;

/** Relevant subset of Chrome's History schema. */
const CHROME_SCHEMA = `
CREATE TABLE urls (id INTEGER PRIMARY KEY AUTOINCREMENT, url LONGVARCHAR, title LONGVARCHAR,
    visit_count INTEGER DEFAULT 0 NOT NULL, typed_count INTEGER DEFAULT 0 NOT NULL, last_visit_time INTEGER NOT NULL,
    hidden INTEGER DEFAULT 0 NOT NULL);
CREATE TABLE visits (id INTEGER PRIMARY KEY AUTOINCREMENT, url INTEGER NOT NULL, visit_time INTEGER NOT NULL,
    from_visit INTEGER, external_referrer_url TEXT, transition INTEGER DEFAULT 0 NOT NULL, segment_id INTEGER,
    visit_duration INTEGER DEFAULT 0 NOT NULL, opener_visit INTEGER);
CREATE TABLE meta (key LONGVARCHAR NOT NULL UNIQUE PRIMARY KEY, value LONGVARCHAR);
`;

export interface FirefoxPlaceFixture {
    id: number;
    url: string;
    title?: string;
    hidden?: number;
    description?: string;
    previewImageUrl?: string;
}

export interface FirefoxVisitFixture {
    id: number;
    placeId: number;
    visitDateUs: number;
    visitType: number;
    fromVisit?: number;
}

export interface FirefoxBookmarkFixture {
    id: number;
    type: 1 | 2;
    parent: number;
    fk?: number;
    title?: string;
    dateAddedUs?: number;
    guid?: string;
}

/** Built-in roots of every places.sqlite. */
export const FIREFOX_ROOTS: FirefoxBookmarkFixture[] = [
    { id: 1, type: 2, parent: 0, title: '', guid: 'root________' },
    { id: 2, type: 2, parent: 1, title: 'menu', guid: 'menu________' },
    { id: 3, type: 2, parent: 1, title: 'toolbar', guid: 'toolbar_____' },
    { id: 4, type: 2, parent: 1, title: 'tags', guid: 'tags________' },
    { id: 5, type: 2, parent: 1, title: 'unfiled', guid: 'unfiled_____' },
];

async function buildDatabase(fill: (db: DatabaseSync) => void, wal: boolean): Promise<Buffer> {
    const directory = await fs.mkdtemp(path.join(tmpdir(), 'browser-history-fixture-'));
    const filePath = path.join(directory, 'fixture.sqlite');

    try {
        const db = new DatabaseSync(filePath);

        if (wal) {
            db.exec('PRAGMA journal_mode = WAL');
        }

        fill(db);
        db.close();

        return await fs.readFile(filePath);
    } finally {
        await fs.rm(directory, { recursive: true, force: true });
    }
}

/** A places.sqlite in WAL mode (header versions 2/2), like a copy of a live profile. */
export function buildFirefoxPlaces(fixture: {
    places: FirefoxPlaceFixture[];
    visits: FirefoxVisitFixture[];
    bookmarks?: FirefoxBookmarkFixture[];
    keywords?: { keyword: string; placeId: number }[];
}): Promise<Buffer> {
    return buildDatabase((db) => {
        db.exec(FIREFOX_SCHEMA);
        const insertPlace = db.prepare(
            'INSERT INTO moz_places (id, url, title, hidden, description, preview_image_url) VALUES (?, ?, ?, ?, ?, ?)',
        );
        const insertVisit = db.prepare(
            'INSERT INTO moz_historyvisits (id, from_visit, place_id, visit_date, visit_type) VALUES (?, ?, ?, ?, ?)',
        );
        const insertBookmark = db.prepare(
            'INSERT INTO moz_bookmarks (id, type, fk, parent, position, title, dateAdded, lastModified, guid) VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?)',
        );
        const insertKeyword = db.prepare('INSERT INTO moz_keywords (keyword, place_id) VALUES (?, ?)');

        for (const place of fixture.places) {
            insertPlace.run(
                place.id,
                place.url,
                place.title ?? null,
                place.hidden ?? 0,
                place.description ?? null,
                place.previewImageUrl ?? null,
            );
        }

        for (const visit of fixture.visits) {
            insertVisit.run(visit.id, visit.fromVisit ?? 0, visit.placeId, visit.visitDateUs, visit.visitType);
        }

        for (const bookmark of [...FIREFOX_ROOTS, ...(fixture.bookmarks ?? [])]) {
            insertBookmark.run(
                bookmark.id,
                bookmark.type,
                bookmark.fk ?? null,
                bookmark.parent,
                bookmark.title ?? null,
                bookmark.dateAddedUs ?? T0_US,
                bookmark.dateAddedUs ?? T0_US,
                bookmark.guid ?? `guid-${bookmark.id}`.padEnd(12, '_'),
            );
        }

        for (const { keyword, placeId } of fixture.keywords ?? []) {
            insertKeyword.run(keyword, placeId);
        }
    }, true);
}

export interface ChromeVisitFixture {
    id: number;
    urlId: number;
    visitTimeUnixUs: number;
    /** Unsigned transition; stored signed like Chrome does. */
    transition: number;
    fromVisit?: number;
    durationUs?: number;
}

export function buildChromeHistory(fixture: {
    urls: { id: number; url: string; title?: string }[];
    visits: ChromeVisitFixture[];
}): Promise<Buffer> {
    return buildDatabase((db) => {
        db.exec(CHROME_SCHEMA);
        const insertUrl = db.prepare('INSERT INTO urls (id, url, title, last_visit_time) VALUES (?, ?, ?, 0)');
        const insertVisit = db.prepare(
            'INSERT INTO visits (id, url, visit_time, from_visit, transition, visit_duration) VALUES (?, ?, ?, ?, ?, ?)',
        );

        for (const url of fixture.urls) {
            insertUrl.run(url.id, url.url, url.title ?? '');
        }

        for (const visit of fixture.visits) {
            insertVisit.run(
                visit.id,
                visit.urlId,
                // WebKit microseconds exceed Number.MAX_SAFE_INTEGER.
                BigInt(visit.visitTimeUnixUs) + WEBKIT_EPOCH_OFFSET_US,
                visit.fromVisit ?? 0,
                visit.transition >= 2 ** 31 ? visit.transition - 2 ** 32 : visit.transition,
                visit.durationUs ?? 0,
            );
        }
    }, false);
}

/** German 2025 Takeout shape: qualifier only. */
export const CHROME_TAKEOUT_2025_JSON = JSON.stringify({
    'Browser History': [
        {
            favicon_url: 'https://news.example.org/favicon.ico',
            page_transition_qualifier: 'CLIENT_REDIRECT',
            title: 'Example News – Front page',
            url: 'https://news.example.org/',
            time_usec: 1_738_240_662_402_951,
            client_id: 'ZmFrZS1jbGllbnQtMQ==',
        },
        {
            page_transition_qualifier: 'CLIENT_REDIRECT',
            title: 'Some extension',
            url: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop/welcome.html',
            time_usec: 1_738_240_761_374_417,
            client_id: 'ZmFrZS1jbGllbnQtMQ==',
        },
        { title: 'No timestamp', url: 'https://broken.example.org/' },
    ],
    'Typed Url': [],
    Session: [],
});

/** English 2019/2020 Takeout shape: core transition per row. */
export const CHROME_TAKEOUT_2020_JSON = JSON.stringify({
    'Browser History': [
        {
            page_transition: 'TYPED',
            title: 'Docs',
            url: 'https://docs.example.com/start',
            time_usec: 1_561_220_353_085_644,
            client_id: 'ZmFrZS1jbGllbnQtMg==',
        },
        {
            page_transition: 'RELOAD',
            title: 'Docs',
            url: 'https://docs.example.com/start',
            time_usec: 1_561_220_360_000_000,
            client_id: 'ZmFrZS1jbGllbnQtMg==',
        },
        {
            page_transition: 'AUTO_SUBFRAME',
            title: 'Ad frame',
            url: 'https://ads.example.net/frame',
            time_usec: 1_561_220_361_000_000,
            client_id: 'ZmFrZS1jbGllbnQtMg==',
        },
        {
            page_transition: 'LINK',
            title: 'Settings',
            url: 'chrome://settings/',
            time_usec: 1_561_220_362_000_000,
            client_id: 'ZmFrZS1jbGllbnQtMg==',
        },
    ],
});

export const NETSCAPE_BOOKMARKS_HTML = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file.
It will be read and overwritten.
DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3 ADD_DATE="0" LAST_MODIFIED="1727782990">Synced Bookmarks</H3>
    <DL><p>
    </DL><p>
    <DT><H3 ADD_DATE="0" LAST_MODIFIED="1727782990">Other Bookmarks</H3>
    <DL><p>
        <DT><A HREF="https://shop.example.com/item?id=1&amp;ref=bm" ADD_DATE="1489439174" LAST_MODIFIED="1670362515">Smart bulb &amp; more</A>
        <DT><H3 ADD_DATE="1489439174">Recipes</H3>
        <DL><p>
            <DT><A HREF="https://cooking.example.org/soup" ADD_DATE="1600000000" TAGS="food,soup" SHORTCUTURL="soup">Tomato soup</A>
            <DT><A HREF="javascript:alert(1)" ADD_DATE="1600000001">Bookmarklet</A>
        </DL><p>
        <DT><A HREF="https://nodate.example.org/">No date</A>
    </DL><p>
    <DT><H3>Bookmark Bar</H3>
    <DL><p>
        <DT><A HREF="http://legacy.example.net/" ADD_DATE="13135041581524818" ICON_URI="http://legacy.example.net/favicon.ico">Legacy WebKit date</A>
    </DL><p>
</DL><p>
`;
