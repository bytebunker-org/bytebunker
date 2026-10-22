import { beforeEach, describe, expect, it } from 'vitest';
import type { EntityManager } from '@mikro-orm/postgresql';
import { TransformChromeTakeoutHistoryPipelineModule } from './transform-chrome-takeout-history.pipeline-module.js';
import { TransformBookmarksHtmlPipelineModule } from './transform-bookmarks-html.pipeline-module.js';
import { NOOP_MODULE_PROGRESS_REPORTER } from '../../../../etl/pipeline/progress/type/module-progress-reporter.interface.js';
import type { FileSample } from '../../../../etl/import/type/file-detection.interface.js';
import {
    asStored,
    CHROME_TAKEOUT_2020_JSON,
    CHROME_TAKEOUT_2025_JSON,
    createServiceStubs,
    fakeAsset,
    NETSCAPE_BOOKMARKS_HTML,
} from './browser-history.fixture.js';

type JsonActivity = Record<string, unknown> & {
    stableKeys: string[];
    startTime: string;
    object: Record<string, unknown>;
};

function sample(relativePath: string, head: string): FileSample {
    const fileName = relativePath.slice(relativePath.lastIndexOf('/') + 1);

    return { relativePath, fileName, extension: fileName.split('.').pop()!.toLowerCase(), size: head.length, head };
}

describe('TransformChromeTakeoutHistoryPipelineModule', () => {
    let module: TransformChromeTakeoutHistoryPipelineModule;
    let stubs: ReturnType<typeof createServiceStubs>;

    beforeEach(() => {
        stubs = createServiceStubs();
        module = new TransformChromeTakeoutHistoryPipelineModule(
            stubs.assetService,
            stubs.graphService,
            stubs.graphNodeService,
        );
    });

    async function run(json: string): Promise<JsonActivity[]> {
        stubs.content = json;
        const output = await module.executeModule({
            em: {} as EntityManager,
            inputData: { historyFile: fakeAsset('Takeout/Chrome/Verlauf.json') },
            progress: NOOP_MODULE_PROGRESS_REPORTER,
        } as never);

        return asStored<JsonActivity[]>(output.activities);
    }

    it('detects German and English Takeout history files by content', () => {
        const head = '{\n    "Browser History": [\n        {';

        expect(module.detectFile(sample('Takeout/Chrome/Verlauf.json', head))?.confidence).toBe(0.97);
        expect(module.detectFile(sample('Takeout/Chrome/BrowserHistory.json', head))?.confidence).toBe(0.97);
        expect(module.detectFile(sample('renamed.json', head))?.confidence).toBe(0.9);
        expect(module.detectFile(sample('Verlauf.json', '{"Typed Url": []}'))).toBeUndefined();
    });

    it('imports the 2025 qualifier-only format and skips internal and broken rows', async () => {
        const activities = await run(CHROME_TAKEOUT_2025_JSON);

        expect(activities).toHaveLength(1);
        expect(activities[0]).toMatchObject({
            '@type': 'View',
            '@secondaryTypes': ['BrowserVisit'],
            stableKeys: ['browser:visit:https://news.example.org/:1738240662402'],
            startTime: '2025-01-30T12:37:42.402Z',
            browser: 'chrome',
            visitType: 'UNKNOWN',
            transition: 'CLIENT_REDIRECT',
            object: { '@type': 'Page', name: 'Example News – Front page', pageUrl: 'https://news.example.org/' },
        });
    });

    it('drops reloads and subframes in the 2020 format', async () => {
        const activities = await run(CHROME_TAKEOUT_2020_JSON);

        expect(activities).toHaveLength(1);
        expect(activities[0]).toMatchObject({
            visitType: 'TYPED',
            object: { pageUrl: 'https://docs.example.com/start' },
        });
    });
});

describe('TransformBookmarksHtmlPipelineModule', () => {
    let module: TransformBookmarksHtmlPipelineModule;
    let stubs: ReturnType<typeof createServiceStubs>;

    beforeEach(() => {
        stubs = createServiceStubs();
        module = new TransformBookmarksHtmlPipelineModule(
            stubs.assetService,
            stubs.graphService,
            stubs.graphNodeService,
        );
    });

    it('detects Netscape bookmark files by DOCTYPE', () => {
        expect(module.detectFile(sample('Chrome/Lesezeichen.html', NETSCAPE_BOOKMARKS_HTML))?.confidence).toBe(0.97);
        expect(module.detectFile(sample('page.html', '<!DOCTYPE html><title>x</title>'))).toBeUndefined();
    });

    it('turns every dated link into an Add/Bookmark with its folder path', async () => {
        stubs.content = NETSCAPE_BOOKMARKS_HTML;
        const output = await module.executeModule({
            em: {} as EntityManager,
            inputData: { bookmarksFile: fakeAsset('Takeout/Chrome/Lesezeichen.html') },
            progress: NOOP_MODULE_PROGRESS_REPORTER,
        } as never);
        const activities = asStored<JsonActivity[]>(output.activities);

        expect(activities.map((activity) => activity.startTime)).toEqual([
            '2017-03-13T21:06:14.000Z',
            '2020-09-13T12:26:40.000Z',
            // ADD_DATE in WebKit microseconds (older Chrome exports).
            '2017-03-26T22:39:41.524Z',
        ]);
        expect(activities[0]).toMatchObject({
            '@type': 'Add',
            '@secondaryTypes': ['Bookmark'],
            stableKeys: ['browser:bookmark:https://shop.example.com/item?id=1&ref=bm:1489439174000'],
            browser: 'chrome',
            folderPath: 'Other Bookmarks',
            bookmarkTitle: 'Smart bulb & more',
            lastModified: '2022-12-06T21:35:15.000Z',
            object: {
                '@type': 'Page',
                name: 'Smart bulb & more',
                pageUrl: 'https://shop.example.com/item?id=1&ref=bm',
            },
        });
        expect(activities[2]).toMatchObject({
            folderPath: 'Bookmark Bar',
            object: { pageUrl: 'http://legacy.example.net/' },
        });
        expect(activities[1]).toMatchObject({
            folderPath: 'Other Bookmarks > Recipes',
            keyword: 'soup',
            bookmarkTags: 'food,soup',
        });
    });
});
