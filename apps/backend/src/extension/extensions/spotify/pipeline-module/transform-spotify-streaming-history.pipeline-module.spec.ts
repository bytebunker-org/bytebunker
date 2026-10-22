import { beforeAll, describe, expect, it } from 'vitest';
import type { ASObject } from '@bytebunker/event-schema';
import { TransformSpotifyStreamingHistoryPipelineModule } from './transform-spotify-streaming-history.pipeline-module.js';
import { ActivityStableKeyService } from '../../../../activity-graph/activity-stable-key.service.js';
import { NOOP_MODULE_PROGRESS_REPORTER } from '../../../../etl/pipeline/progress/type/module-progress-reporter.interface.js';
import { setGlobalSettings } from '../../../../shared/setting/global-setting.constant.js';
import type { FileSample } from '../../../../etl/import/type/file-detection.interface.js';
import type { SpotifyStreamingHistoryEntry } from '../type/spotify-streaming-history-entry.interface.js';

const GENERATOR: ASObject = { '@id': 'extension/spotify', '@type': 'Application', name: 'spotify' };
const ACTOR_ID = '00000000-0000-0000-0000-0000000000aa';

const EMPTY_ROW: SpotifyStreamingHistoryEntry = {
    ts: null,
    platform: 'linux',
    ms_played: 0,
    conn_country: 'ZZ',
    ip_addr: null,
    master_metadata_track_name: null,
    master_metadata_album_artist_name: null,
    master_metadata_album_album_name: null,
    spotify_track_uri: null,
    episode_name: null,
    episode_show_name: null,
    spotify_episode_uri: null,
    audiobook_title: null,
    audiobook_uri: null,
    audiobook_chapter_uri: null,
    audiobook_chapter_title: null,
    reason_start: 'trackdone',
    reason_end: 'trackdone',
    shuffle: false,
    skipped: false,
    offline: false,
    offline_timestamp: null,
    incognito_mode: false,
};

const track = (ts: string, msPlayed: number, uri = 'spotify:track:aaa'): SpotifyStreamingHistoryEntry => ({
    ...EMPTY_ROW,
    ts,
    ms_played: msPlayed,
    master_metadata_track_name: 'Synthetic Song',
    master_metadata_album_artist_name: 'Synthetic Artist',
    master_metadata_album_album_name: 'Synthetic Album',
    spotify_track_uri: uri,
});

type Activity = Record<string, unknown> & { stableKeys: string[]; object: Record<string, unknown> };

describe('TransformSpotifyStreamingHistoryPipelineModule', () => {
    const module = new TransformSpotifyStreamingHistoryPipelineModule(
        undefined as never,
        new ActivityStableKeyService(undefined as never, undefined as never),
        undefined as never,
        undefined as never,
    );
    const transform = (rows: unknown[], isVideo = false) =>
        module.transformRows(rows, {
            isVideo,
            generatorExtensionObject: GENERATOR,
            actorId: ACTOR_ID,
            progress: NOOP_MODULE_PROGRESS_REPORTER,
        });

    beforeAll(() => {
        setGlobalSettings({
            eventUniqueLocationPrecisionSetting: 5,
            eventUniqueDateTimePrecisionSetting: 'second',
        } as Parameters<typeof setGlobalSettings>[0]);
    });

    it('uses ts as the end of playback and derives the start from ms_played', () => {
        const { activities, skipped } = transform([track('2024-03-01T10:00:00Z', 90_500)]);
        const listen = activities[0] as unknown as Activity;

        expect(skipped).toBeUndefined();
        expect(listen['@type']).toBe('Listen');
        expect(String(listen['endTime'])).toBe('2024-03-01T10:00:00.000Z');
        expect(String(listen['startTime'])).toBe('2024-03-01T09:58:29.500Z');
        expect(listen).toMatchObject({ msPlayed: 90_500, platform: 'linux', country: 'ZZ', skipped: false });
        expect(listen.object).toMatchObject({
            '@type': 'Audio',
            '@secondaryTypes': ['MusicRecording', 'SpotifyTrack'],
            identifier: 'spotify:track:aaa',
            name: 'Synthetic Song',
            byArtist: 'Synthetic Artist',
            inAlbum: 'Synthetic Album',
        });
    });

    it('gives quick skips within one minute distinct activity keys and shares the object key by URI', () => {
        const activities = transform([
            track('2024-03-01T10:00:05Z', 2_000, 'spotify:track:aaa'),
            track('2024-03-01T10:00:09Z', 3_000, 'spotify:track:bbb'),
            track('2024-03-01T10:00:40Z', 3_000, 'spotify:track:aaa'),
        ]).activities as unknown as Activity[];

        expect(new Set(activities.map((a) => a.stableKeys[0])).size).toBe(3);
        expect(activities[0]!.object['stableKeys']).toEqual(activities[2]!.object['stableKeys']);
        expect(activities[0]!.object['stableKeys']).not.toEqual(activities[1]!.object['stableKeys']);
    });

    it('merges a play logged twice, keeping the longer row', () => {
        const { activities, skipped } = transform([
            track('2024-03-01T10:00:00Z', 1_000),
            track('2024-03-01T10:00:00Z', 5_000),
        ]);

        expect(activities).toHaveLength(1);
        expect((activities[0] as unknown as Activity)['msPlayed']).toBe(5_000);
        expect(skipped).toEqual({ total: 1, byReason: { duplicateRow: 1 } });
    });

    it('maps episodes and audiobook chapters', () => {
        const activities = transform([
            {
                ...EMPTY_ROW,
                ts: '2024-03-01T10:00:00Z',
                ms_played: 1000,
                episode_name: 'Episode',
                episode_show_name: 'Show',
                spotify_episode_uri: 'spotify:episode:ep',
            },
            {
                ...EMPTY_ROW,
                ts: '2024-03-01T11:00:00Z',
                ms_played: 1000,
                audiobook_title: 'Book',
                audiobook_uri: 'spotify:show:book',
                audiobook_chapter_title: 'Chapter 1',
                audiobook_chapter_uri: 'spotify:episode:chapter',
            },
        ]).activities as unknown as Activity[];

        expect(activities[0]!.object).toMatchObject({
            '@secondaryTypes': ['PodcastEpisode', 'SpotifyEpisode'],
            name: 'Episode',
            showName: 'Show',
        });
        expect(activities[1]!.object).toMatchObject({
            '@type': 'Audio',
            '@secondaryTypes': ['AudiobookChapter', 'SpotifyAudiobookChapter'],
            name: 'Chapter 1',
            audiobookTitle: 'Book',
            audiobookIdentifier: 'spotify:show:book',
        });
    });

    it('turns video rows into View activities of a Video', () => {
        const { activities } = transform([track('2024-03-01T10:00:00Z', 1_000)], true) as unknown as {
            activities: Activity[];
        };

        expect(activities[0]).toMatchObject({ '@type': 'View', '@secondaryTypes': ['SpotifyViewActivity'] });
        expect(activities[0]!.object).toMatchObject({
            '@type': 'Video',
            '@secondaryTypes': ['SpotifyVideo'],
            contentType: 'track',
            identifier: 'spotify:track:aaa',
        });
    });

    it('skips and counts invalid rows instead of failing', () => {
        const { activities, skipped } = transform([
            track('2024-03-01T10:00:00Z', 1_000),
            'not a row',
            track('yesterday', 1_000),
            { ...track('2024-03-01T10:01:00Z', 1_000), ms_played: null },
            { ...EMPTY_ROW, ts: '2024-03-01T10:02:00Z', ms_played: 1_000 },
        ]);

        expect(activities).toHaveLength(1);
        expect(skipped).toEqual({
            total: 4,
            byReason: { notAnObject: 1, invalidTimestamp: 1, invalidMsPlayed: 1, noContentUri: 1 },
        });
    });

    it('detects audio and video streaming history files', () => {
        const sample = (fileName: string, head: string): FileSample => ({
            relativePath: `spotify/${fileName}`,
            fileName,
            extension: 'json',
            size: head.length,
            head,
        });
        const head = JSON.stringify([track('2024-03-01T10:00:00Z', 1_000)], null, 4);

        expect(module.detectFile(sample('Streaming_History_Audio_2024.json', head))).toMatchObject({
            confidence: 0.95,
            format: 'Spotify Extended Streaming History (audio)',
        });
        expect(module.detectFile(sample('Streaming_History_Video_2024.json', head))?.format).toContain('video');
        expect(
            module.detectFile(sample('StreamingHistory0.json', '[{"endTime":"2024-03-01 10:00","msPlayed":1}]')),
        ).toBeUndefined();
    });
});
