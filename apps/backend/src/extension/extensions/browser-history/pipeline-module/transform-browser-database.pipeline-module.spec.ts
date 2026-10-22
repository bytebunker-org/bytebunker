import { beforeEach, describe, expect, it } from 'vitest';
import type { EntityManager } from '@mikro-orm/postgresql';
import { TransformBrowserDatabasePipelineModule } from './transform-browser-database.pipeline-module.js';
import { NOOP_MODULE_PROGRESS_REPORTER } from '../../../../etl/pipeline/progress/type/module-progress-reporter.interface.js';
import type { FileSample } from '../../../../etl/import/type/file-detection.interface.js';
import {
    asStored,
    buildChromeHistory,
    buildFirefoxPlaces,
    createServiceStubs,
    FAKE_ACTOR_ID,
    FAKE_GENERATOR,
    fakeAsset,
    T0_US,
} from './browser-history.fixture.js';

const SECOND_US = 1_000_000;
// Chrome transition qualifier bits.
const CHAIN_START = 0x10_00_00_00;
const CHAIN_END = 0x20_00_00_00;
const SERVER_REDIRECT = 0x80_00_00_00;

type JsonActivity = Record<string, unknown> & {
    '@type': string;
    browser?: string;
    profileName?: string;
    stableKeys: string[];
    startTime: string;
    object: Record<string, unknown>;
};

function sample(fileName: string, head: string): FileSample {
    return { relativePath: `browser/${fileName}`, fileName, extension: '', size: head.length, head };
}

describe('TransformBrowserDatabasePipelineModule', () => {
    let module: TransformBrowserDatabasePipelineModule;
    let stubs: ReturnType<typeof createServiceStubs>;

    beforeEach(() => {
        stubs = createServiceStubs();
        module = new TransformBrowserDatabasePipelineModule(
            stubs.assetService,
            stubs.graphService,
            stubs.graphNodeService,
        );
    });

    async function run(data: Buffer, originalPath: string, options: Record<string, unknown> = {}) {
        stubs.content = data;
        const output = await module.executeModule({
            em: {} as EntityManager,
            inputData: { databaseFile: fakeAsset(originalPath), ...options },
            progress: NOOP_MODULE_PROGRESS_REPORTER,
        } as never);

        return asStored<JsonActivity[]>(output.activities);
    }

    describe('detectFile', () => {
        it('recognises places.sqlite and History by name and SQLite magic', () => {
            const head = 'SQLite format 3\0rest-of-header';

            expect(module.detectFile(sample('places.sqlite', head))?.confidence).toBeGreaterThanOrEqual(0.9);
            expect(module.detectFile(sample('History', head))?.confidence).toBeGreaterThanOrEqual(0.9);
            expect(module.detectFile(sample('cookies.sqlite', head))).toBeUndefined();
            expect(module.detectFile(sample('places.sqlite', '{"not":"sqlite"}'))).toBeUndefined();
        });
    });

    describe('Firefox places.sqlite', () => {
        it('keeps real visits, drops redirect hops, reloads, frames and internal URLs', async () => {
            const data = await buildFirefoxPlaces({
                places: [
                    {
                        id: 1,
                        url: 'https://Blog.Example.com:443/post#',
                        title: 'A post',
                        description: 'A long read about things',
                        previewImageUrl: 'https://blog.example.com/cover.png',
                    },
                    { id: 2, url: 'https://t.example.net/abc', hidden: 1 },
                    { id: 3, url: 'https://target.example.org/landing', title: 'Landing' },
                    { id: 4, url: 'about:preferences' },
                    { id: 5, url: 'https://files.example.org/report.pdf', title: 'report.pdf' },
                    { id: 6, url: 'https://frame.example.net/widget' },
                ],
                visits: [
                    { id: 1, placeId: 1, visitDateUs: T0_US, visitType: 2 },
                    { id: 2, placeId: 1, visitDateUs: T0_US + SECOND_US, visitType: 9 },
                    // Link to a shortener that redirected (temporary) to the landing page.
                    { id: 3, placeId: 2, visitDateUs: T0_US + 2 * SECOND_US, visitType: 1, fromVisit: 1 },
                    { id: 4, placeId: 3, visitDateUs: T0_US + 3 * SECOND_US, visitType: 6, fromVisit: 3 },
                    { id: 5, placeId: 4, visitDateUs: T0_US + 4 * SECOND_US, visitType: 2 },
                    { id: 6, placeId: 5, visitDateUs: T0_US + 5 * SECOND_US, visitType: 7, fromVisit: 1 },
                    { id: 7, placeId: 6, visitDateUs: T0_US + 6 * SECOND_US, visitType: 8 },
                ],
            });

            const activities = await run(data, 'browser/firefox/h0f01llj.dev-edition-default/places.sqlite');

            expect(activities.map((activity) => activity.object['stableKeys'])).toEqual([
                ['page:https://blog.example.com/post'],
                ['page:https://target.example.org/landing'],
                ['page:https://files.example.org/report.pdf'],
            ]);

            const [typed, redirectTarget, download] = activities;

            expect(typed).toMatchObject({
                '@type': 'View',
                '@secondaryTypes': ['BrowserVisit'],
                generator: FAKE_GENERATOR,
                actor: { '@id': FAKE_ACTOR_ID, '@type': 'Person' },
                stableKeys: [`browser:visit:https://blog.example.com/post:${Math.floor(T0_US / 1000)}`],
                startTime: '2025-03-01T10:00:00.123Z',
                browser: 'firefox',
                profileName: 'dev-edition-default',
                visitType: 'TYPED',
                object: {
                    '@type': 'Page',
                    name: 'A post',
                    pageUrl: 'https://blog.example.com/post',
                    description: 'A long read about things',
                    previewImageUrl: 'https://blog.example.com/cover.png',
                },
            });
            expect(redirectTarget).toMatchObject({
                visitType: 'REDIRECT_TEMPORARY',
                fromUrl: 'https://t.example.net/abc',
            });
            expect(download).toMatchObject({ visitType: 'DOWNLOAD', fromUrl: 'https://blog.example.com/post' });
        });

        it('gives a synced copy of a visit (millisecond precision) the same key as the original', async () => {
            const places = [{ id: 1, url: 'https://example.com/', title: 'Example' }];
            const original = await buildFirefoxPlaces({
                places,
                visits: [{ id: 1, placeId: 1, visitDateUs: T0_US, visitType: 1 }],
            });
            const synced = await buildFirefoxPlaces({
                places,
                visits: [{ id: 9, placeId: 1, visitDateUs: Math.floor(T0_US / 1000) * 1000, visitType: 1 }],
            });

            const [a] = await run(original, 'firefox/aaaaaaaa.default-release/places.sqlite');
            const [b] = await run(synced, 'firefox/bbbbbbbb.dev-edition-default/places.sqlite');

            expect(a.stableKeys).toEqual(b.stableKeys);
            expect(a.profileName).toBe('default-release');
        });

        it('only details a page on its first reference', async () => {
            const data = await buildFirefoxPlaces({
                places: [{ id: 1, url: 'https://example.com/', title: 'Example' }],
                visits: [
                    { id: 1, placeId: 1, visitDateUs: T0_US, visitType: 1 },
                    { id: 2, placeId: 1, visitDateUs: T0_US + SECOND_US, visitType: 1 },
                ],
            });

            const [first, second] = await run(data, 'places.sqlite');

            expect(first.object).toMatchObject({ name: 'Example', pageUrl: 'https://example.com/' });
            expect(second.object).toEqual({ '@type': 'Page', stableKeys: ['page:https://example.com/'] });
            expect(first.profileName).toBeUndefined();
        });

        it('imports bookmarks with folder path, keyword and tags', async () => {
            const data = await buildFirefoxPlaces({
                places: [
                    { id: 1, url: 'https://recipes.example.org/soup', title: 'Soup page' },
                    { id: 2, url: 'place:sort=8&maxResults=10' },
                ],
                visits: [],
                bookmarks: [
                    { id: 10, type: 2, parent: 3, title: 'Cooking', guid: 'folderCookng' },
                    {
                        id: 11,
                        type: 1,
                        parent: 10,
                        fk: 1,
                        title: 'Tomato soup',
                        dateAddedUs: T0_US,
                        guid: 'bookmarkSoup',
                    },
                    { id: 12, type: 1, parent: 2, fk: 2, title: 'Most visited', dateAddedUs: T0_US },
                    // Tag "food" on the soup page: a folder under the tags root holding a bookmark of the same place.
                    { id: 13, type: 2, parent: 4, title: 'food' },
                    { id: 14, type: 1, parent: 13, fk: 1, dateAddedUs: T0_US },
                ],
                keywords: [{ keyword: 'soup', placeId: 1 }],
            });

            const activities = await run(data, 'places.sqlite', { profileName: 'laptop' });

            expect(activities).toHaveLength(1);
            expect(activities[0]).toMatchObject({
                '@type': 'Add',
                '@secondaryTypes': ['Bookmark'],
                stableKeys: [
                    `browser:bookmark:https://recipes.example.org/soup:${Math.floor(T0_US / 1000)}`,
                    'browser:bookmark:firefox:bookmarkSoup',
                ],
                profileName: 'laptop',
                folderPath: 'Bookmarks Toolbar > Cooking',
                bookmarkTitle: 'Tomato soup',
                keyword: 'soup',
                bookmarkTags: 'food',
                object: { '@type': 'Page', name: 'Tomato soup', pageUrl: 'https://recipes.example.org/soup' },
            });
        });

        it('filters visits by fromDate/toDate', async () => {
            const data = await buildFirefoxPlaces({
                places: [{ id: 1, url: 'https://example.com/' }],
                visits: [
                    { id: 1, placeId: 1, visitDateUs: T0_US, visitType: 1 },
                    { id: 2, placeId: 1, visitDateUs: T0_US + 86_400 * SECOND_US, visitType: 1 },
                ],
            });

            const activities = await run(data, 'places.sqlite', { fromDate: '2025-03-02' });

            expect(activities.map((activity) => activity.startTime)).toEqual(['2025-03-02T10:00:00.123Z']);
        });
    });

    describe('Chrome History', () => {
        it('converts WebKit times and keeps only the end of redirect chains', async () => {
            const data = await buildChromeHistory({
                urls: [
                    { id: 1, url: 'http://short.example.net/x', title: '' },
                    { id: 2, url: 'https://www.example.com/article', title: 'Article' },
                    { id: 3, url: 'chrome://newtab/', title: 'New Tab' },
                ],
                visits: [
                    { id: 1, urlId: 1, visitTimeUnixUs: T0_US, transition: 1 | CHAIN_START },
                    {
                        id: 2,
                        urlId: 2,
                        visitTimeUnixUs: T0_US + 1000,
                        transition: 1 | CHAIN_END | SERVER_REDIRECT,
                        fromVisit: 1,
                        durationUs: 42_000_000,
                    },
                    { id: 3, urlId: 2, visitTimeUnixUs: T0_US + SECOND_US, transition: 8 | CHAIN_START | CHAIN_END },
                    {
                        id: 4,
                        urlId: 2,
                        visitTimeUnixUs: T0_US + 2 * SECOND_US,
                        transition: 3 | CHAIN_START | CHAIN_END,
                    },
                    {
                        id: 5,
                        urlId: 3,
                        visitTimeUnixUs: T0_US + 3 * SECOND_US,
                        transition: 1 | CHAIN_START | CHAIN_END,
                    },
                ],
            });

            const activities = await run(data, 'browser/chromium/Default/History');

            expect(activities).toHaveLength(1);
            expect(activities[0]).toMatchObject({
                '@type': 'View',
                startTime: '2025-03-01T10:00:00.124Z',
                browser: 'chromium',
                profileName: 'Default',
                visitType: 'TYPED',
                transition: 'CHAIN_END,SERVER_REDIRECT',
                fromUrl: 'http://short.example.net/x',
                durationMs: 42_000,
                object: { name: 'Article', pageUrl: 'https://www.example.com/article' },
            });
        });

        it('defaults to chrome and honours the browser option', async () => {
            const data = await buildChromeHistory({
                urls: [{ id: 1, url: 'https://example.com/', title: 'Example' }],
                visits: [{ id: 1, urlId: 1, visitTimeUnixUs: T0_US, transition: CHAIN_START | CHAIN_END }],
            });

            expect((await run(data, 'Profile 1/History'))[0].browser).toBe('chrome');
            expect((await run(data, 'History', { browser: 'Chromium' }))[0].browser).toBe('chromium');
        });
    });

    it('rejects files that are not SQLite', async () => {
        await expect(run(Buffer.from('not sqlite at all'), 'places.sqlite')).rejects.toThrow(/not a SQLite/);
    });
});
