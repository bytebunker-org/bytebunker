import { describe, expect, it } from 'vitest';
import type { FileSample } from '../../../../etl/import/type/file-detection.interface.js';
import { FILE_DETECTION_MIN_CONFIDENCE } from '../../../../etl/import/type/file-detection.interface.js';
import { TransformGoogleMyActivityPipelineModule } from '../../google/pipeline-module/transform-google-my-activity.pipeline-module.js';
import { TransformYouTubeWatchHistoryPipelineModule } from './transform-youtube-watch-history.pipeline-module.js';
import { TransformYouTubeSearchHistoryPipelineModule } from './transform-youtube-search-history.pipeline-module.js';

const none = undefined as never;
const modules = {
    myActivity: new TransformGoogleMyActivityPipelineModule(none, none, none, none),
    watchHistory: new TransformYouTubeWatchHistoryPipelineModule(none, none, none, none),
    searchHistory: new TransformYouTubeSearchHistoryPipelineModule(none, none, none, none),
};

/** Real files start with ~140 kB of CSS, so the 64 kB head holds only the title. */
const GERMAN_HEAD = '<html><head><title>Mein Aktivitätsverlauf</title><style type="text/css">/** css */';
const ENGLISH_HEAD = '<html><head><title>My Activity History</title><style type="text/css">/** css */';

function sample(relativePath: string, head: string): FileSample {
    const fileName = relativePath.slice(relativePath.lastIndexOf('/') + 1);

    return { relativePath, fileName, extension: 'html', size: 200_000, head };
}

/** The importers that would accept the file. */
function claimants(file: FileSample): string[] {
    return Object.entries(modules)
        .filter(([, module]) => (module.detectFile(file)?.confidence ?? 0) >= FILE_DETECTION_MIN_CONFIDENCE)
        .map(([name]) => name);
}

describe('Takeout activity HTML detection', () => {
    it.each([
        ['Takeout/Meine Aktivitäten/YouTube/MeineAktivitäten.html', GERMAN_HEAD, 'myActivity'],
        ['Takeout/Meine Aktivitäten/Google Suche/MeineAktivitäten.html', GERMAN_HEAD, 'myActivity'],
        ['Takeout/My Activity/Search/MyActivity.html', ENGLISH_HEAD, 'myActivity'],
        ['Takeout/Maps/Suchverlauf.html', GERMAN_HEAD, 'myActivity'],
        ['Takeout/YouTube und YouTube Music/Verlauf/Wiedergabeverlauf.html', GERMAN_HEAD, 'watchHistory'],
        ['Takeout/YouTube and YouTube Music/history/watch-history.html', ENGLISH_HEAD, 'watchHistory'],
        ['Takeout/YouTube und YouTube Music/Verlauf/Suchverlauf.html', GERMAN_HEAD, 'searchHistory'],
        ['Takeout/YouTube and YouTube Music/history/search-history.html', ENGLISH_HEAD, 'searchHistory'],
    ])('%s is claimed by %s only', (path, head, expected) => {
        expect(claimants(sample(path, head))).toEqual([expected]);
    });

    it('lets the watch history keep its 0.3 for My Activity files that show watch links', () => {
        const head = `${GERMAN_HEAD}<div class="outer-cell"><a href="https://www.youtube.com/watch?v=x">x</a>`;
        const file = sample('Takeout/Meine Aktivitäten/YouTube/MeineAktivitäten.html', head);

        expect(modules.watchHistory.detectFile(file)?.confidence).toBe(0.3);
        expect(claimants(file)).toEqual(['myActivity']);
    });

    it('ignores unrelated HTML', () => {
        expect(claimants(sample('bookmarks.html', '<!DOCTYPE NETSCAPE-Bookmark-file-1>'))).toEqual([]);
    });
});
