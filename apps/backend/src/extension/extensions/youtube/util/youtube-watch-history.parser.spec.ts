import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseYouTubeWatchHistory } from './youtube-watch-history.parser.js';
import { parseGermanTimestamp } from './youtube-date.util.js';
import { YouTubeProductEnum } from '@bytebunker/event-schema/extension/youtube';

const fixturePath = join(
    dirname(fileURLToPath(import.meta.url)),
    '__fixtures__',
    'wiedergabeverlauf.fixture.html',
);
const fixtureHtml = readFileSync(fixturePath, 'utf8');

describe('parseGermanTimestamp', () => {
    it('parses winter MEZ as UTC+1', () => {
        const dt = parseGermanTimestamp('03.02.2025, 12:08:18 MEZ')!;
        expect(dt.toUTC().toISO()).toBe('2025-02-03T11:08:18.000Z');
    });

    it('parses summer MESZ as UTC+2', () => {
        const dt = parseGermanTimestamp('15.07.2024, 18:30:00 MESZ')!;
        expect(dt.toUTC().toISO()).toBe('2024-07-15T16:30:00.000Z');
    });

    it('treats MEZ as fixed UTC+1 even on summer dates (Google takeout quirk)', () => {
        const dt = parseGermanTimestamp('08.08.2014, 21:42:07 MEZ')!;
        expect(dt.toUTC().toISO()).toBe('2014-08-08T20:42:07.000Z');
    });

    it('returns undefined for unparseable input', () => {
        expect(parseGermanTimestamp('garbage')).toBeUndefined();
    });
});

describe('parseYouTubeWatchHistory', () => {
    const entries = parseYouTubeWatchHistory(fixtureHtml);

    it('parses every entry in the fixture', () => {
        expect(entries).toHaveLength(5);
    });

    it('classifies music.youtube.com rows as YouTubeMusic', () => {
        const music = entries.filter((e) => e.product === YouTubeProductEnum.YOUTUBE_MUSIC);
        expect(music).toHaveLength(2);
        expect(music[0]).toMatchObject({
            product: YouTubeProductEnum.YOUTUBE_MUSIC,
            videoId: 'eHq718sW4_E',
            title: 'Promises (Skrillex & Nero Remix)',
            channelName: 'NERO - Topic',
            channelId: 'UCeS-Obw3kbR8cTL1KiAa-Rg',
            videoUrl: 'https://music.youtube.com/watch?v=eHq718sW4_E',
        });
    });

    it('classifies www.youtube.com rows as YouTube', () => {
        const yt = entries.filter((e) => e.product === YouTubeProductEnum.YOUTUBE);
        expect(yt).toHaveLength(3);
        expect(yt[0]).toMatchObject({
            product: YouTubeProductEnum.YOUTUBE,
            videoId: 'y1D4DiZhSIo',
            title: 'How I Won The GMTK Game Jam',
            channelName: 'JimmyGameDev',
            channelId: 'UCeJMFlg7O783tVf8z36NsAQ',
        });
    });

    it('parses MEZ and MESZ timestamps correctly', () => {
        const winter = entries.find((e) => e.videoId === 'eHq718sW4_E')!;
        expect(winter.watchedAt).toBe('2025-02-03T12:08:18.000+01:00');

        const summer = entries.find((e) => e.videoId === 'SUMMERdst123')!;
        expect(summer.watchedAt).toBe('2024-07-15T18:30:00.000+02:00');
    });
});
