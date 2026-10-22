import { describe, expect, it } from 'vitest';
import { parseSpotifyStreamingHistory } from './spotify-streaming-history.parser.js';
import { AUDIOBOOK_ROW, EPISODE_ROW, NO_URI_ROW, spotifyRow, TRACK_ROW } from './spotify-streaming-history.fixture.js';

const parse = (rows: unknown[]) => parseSpotifyStreamingHistory(JSON.stringify(rows));

describe('parseSpotifyStreamingHistory', () => {
    it('treats ts as the end of playback and derives the start from ms_played', () => {
        const [play] = parse([TRACK_ROW]).plays;

        expect(play.endTime.toISO()).toBe('2024-03-10T18:04:30.000Z');
        expect(play.startTime.toISO()).toBe('2024-03-10T18:00:59.500Z');
        expect(play.msPlayed).toBe(210_500);
    });

    it('reads a track row', () => {
        const [play] = parse([TRACK_ROW]).plays;

        expect(play).toMatchObject({
            kind: 'track',
            uri: 'spotify:track:0000000000000000000001',
            playKey: 'spotify:play:2024-03-10T18:04:30Z:spotify:track:0000000000000000000001:210500',
            trackName: 'Paper Lanterns',
            artistName: 'The Example Band',
            albumName: 'Night Market',
            shuffle: true,
            offline: true,
            offlineTimestamp: '2024-03-10T18:01:00Z',
        });
        expect(play).not.toHaveProperty('episodeName');
    });

    it('reads an episode row', () => {
        const [play] = parse([EPISODE_ROW]).plays;

        expect(play).toMatchObject({
            kind: 'episode',
            uri: 'spotify:episode:0000000000000000000002',
            episodeName: 'Episode 12: Testing Things',
            showName: 'The Fake Podcast',
            platform: 'Linux [x86-64 0]',
        });
    });

    it('reads an audiobook row and its millisecond offline timestamp', () => {
        const [play] = parse([AUDIOBOOK_ROW]).plays;

        expect(play).toMatchObject({
            kind: 'audiobook',
            uri: 'spotify:episode:0000000000000000000004',
            audiobookTitle: 'The Imaginary Case',
            audiobookUri: 'spotify:show:0000000000000000000003',
            audiobookChapterTitle: 'Chapter 1',
            offlineTimestamp: '2025-04-17T12:43:25Z',
        });
    });

    it('keys rows without any URI by ts and platform', () => {
        const [play] = parse([NO_URI_ROW]).plays;

        expect(play.kind).toBe('unknown');
        expect(play.uri).toBeUndefined();
        expect(play.playKey).toBe('spotify:play:2025-01-02T11:42:36Z:unknown:android:4677');
    });

    it('keeps the IP address', () => {
        const [play] = parse([TRACK_ROW]).plays;

        expect(play?.ipAddress).toBe('192.0.2.10');
    });

    it('skips and counts malformed rows without failing the file', () => {
        const result = parse([
            null,
            'not a row',
            [1, 2],
            spotifyRow({ ts: 'yesterday' }),
            spotifyRow({ ts: undefined as never }),
            spotifyRow({ ms_played: undefined as never }),
            spotifyRow({ ms_played: -5 }),
            spotifyRow({ ms_played: '1000' as never }),
            TRACK_ROW,
        ]);

        expect(result.rowCount).toBe(9);
        expect(result.plays).toHaveLength(1);
        expect(result.skipped).toEqual({ 'not-an-object': 3, 'invalid-ts': 2, 'invalid-ms-played': 3 });
    });

    it('throws when the file is not an array', () => {
        expect(() => parseSpotifyStreamingHistory('{"ts": "2024-01-01T00:00:00Z"}')).toThrow(/JSON array/);
        expect(() => parseSpotifyStreamingHistory('not json')).toThrow();
    });

    it('gives two plays of the same track within one minute different keys', () => {
        const skippedThrough = spotifyRow({ ...TRACK_ROW, ts: '2024-03-10T18:05:02Z', ms_played: 1200 });
        const { plays } = parse([TRACK_ROW, skippedThrough]);

        expect(plays).toHaveLength(2);
        expect(new Set(plays.map((play) => play.playKey)).size).toBe(2);
    });

    it('separates plays ending in the same second by their duration', () => {
        const other = spotifyRow({ ...TRACK_ROW, ms_played: 15_412, reason_end: 'fwdbtn' });
        const { plays } = parse([TRACK_ROW, other]);

        expect(plays.map((play) => play.playKey)).toEqual([
            'spotify:play:2024-03-10T18:04:30Z:spotify:track:0000000000000000000001:210500',
            'spotify:play:2024-03-10T18:04:30Z:spotify:track:0000000000000000000001:15412',
        ]);
    });

    it('numbers distinct plays that share ts, URI and duration in file order', () => {
        const zero = spotifyRow({ ...TRACK_ROW, ms_played: 0, reason_end: 'backbtn' });
        const zeroAgain = spotifyRow({ ...zero, reason_end: 'fwdbtn' });
        const { plays } = parse([zero, zeroAgain]);

        expect(plays.map((play) => play.playKey)).toEqual([
            'spotify:play:2024-03-10T18:04:30Z:spotify:track:0000000000000000000001:0',
            'spotify:play:2024-03-10T18:04:30Z:spotify:track:0000000000000000000001:0#2',
        ]);
    });

    it('drops rows that repeat an earlier row (IP address aside)', () => {
        const repeated = spotifyRow({ ...TRACK_ROW, ip_addr: '198.51.100.7' });
        const result = parse([TRACK_ROW, EPISODE_ROW, repeated]);

        expect(result.plays).toHaveLength(2);
        expect(result.duplicateRows).toBe(1);
    });
});
