import { describe, expect, it } from 'vitest';
import { guessKnownFormat } from './known-file-formats.constant.js';
import type { FileSample } from './type/file-detection.interface.js';

function sample(relativePath: string, head: string): FileSample {
    const fileName = relativePath.split('/').at(-1)!;

    return { relativePath, fileName, extension: fileName.split('.').at(-1)!, size: head.length, head };
}

describe('guessKnownFormat', () => {
    it('names the unsupported short Spotify history', () => {
        const head = '[{"endTime":"2024-01-01 10:00","artistName":"a","trackName":"b","msPlayed":1000}]';

        expect(guessKnownFormat(sample('MyData/StreamingHistory_music_0.json', head))).toContain('account data');
    });

    it('does not claim formats that have an importer', () => {
        const extended = '[{"ts":"2024-01-01T00:00:00Z","ms_played":5,"spotify_track_uri":"spotify:track:x"}]';

        expect(guessKnownFormat(sample('Streaming_History_Audio_2024.json', extended))).toBeUndefined();
        expect(guessKnownFormat(sample('Takeout/Chrome/History.json', '{"Browser History": []}'))).toBeUndefined();
        expect(guessKnownFormat(sample('Chats/chat.txt', '[01.02.23, 10:00:00] A: hi'))).toBeUndefined();
    });
});
