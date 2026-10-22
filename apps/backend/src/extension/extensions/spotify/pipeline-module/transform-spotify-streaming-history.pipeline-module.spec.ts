import { beforeEach, describe, expect, it } from 'vitest';
import { TestBed } from '@suites/unit';
import type { Mocked } from '@suites/doubles.vitest';
import type { EntityManager } from '@mikro-orm/postgresql';
import type { ASObject } from '@bytebunker/event-schema';
import {
    resolveMediaType,
    TransformSpotifyStreamingHistoryPipelineModule,
} from './transform-spotify-streaming-history.pipeline-module.js';
import { NOOP_MODULE_PROGRESS_REPORTER } from '../../../../etl/pipeline/progress/type/module-progress-reporter.interface.js';
import { AssetService } from '../../../../etl/asset/asset.service.js';
import { ActivityStableKeyService } from '../../../../activity-graph/activity-stable-key.service.js';
import { ActivityGraphService } from '../../../../activity-graph/activity-graph.service.js';
import { ActivityGraphNodeService } from '../../../../activity-graph/activity-graph-node.service.js';
import type { AssetDto } from '../../../../etl/asset/dto/asset.dto.js';
import type { FileSample } from '../../../../etl/import/type/file-detection.interface.js';
import {
    AUDIOBOOK_ROW,
    EPISODE_ROW,
    NO_URI_ROW,
    TRACK_ROW,
    VIDEO_TRACK_ROW,
} from '../util/spotify-streaming-history.fixture.js';

const FAKE_ACTOR_ID = '00000000-0000-0000-0000-0000000000aa';
const FAKE_GENERATOR: ASObject = {
    '@id': '00000000-0000-0000-0000-0000000000bb',
    '@type': 'Application',
    name: 'spotify',
};

interface ActivityRecord {
    [key: string]: unknown;
    summary?: string;
    startTime?: string;
    endTime?: string;
    stableKeys?: string[];
    mediaType?: string;
    object?: { [key: string]: unknown; stableKeys?: string[] };
}

describe('TransformSpotifyStreamingHistoryPipelineModule', () => {
    let module: TransformSpotifyStreamingHistoryPipelineModule;
    let assetService: Mocked<AssetService>;
    let stableKeyService: Mocked<ActivityStableKeyService>;
    let graphService: Mocked<ActivityGraphService>;
    let graphNodeService: Mocked<ActivityGraphNodeService>;

    const transform = (rows: unknown[], mediaType: 'audio' | 'video' = 'audio') =>
        module.transformStreamingHistory(JSON.stringify(rows), mediaType, FAKE_GENERATOR, FAKE_ACTOR_ID)
            .activities as unknown as ActivityRecord[];

    beforeEach(async () => {
        const { unit, unitRef } = await TestBed.solitary(TransformSpotifyStreamingHistoryPipelineModule).compile();

        module = unit;
        assetService = unitRef.get(AssetService) as unknown as Mocked<AssetService>;
        stableKeyService = unitRef.get(ActivityStableKeyService) as unknown as Mocked<ActivityStableKeyService>;
        graphService = unitRef.get(ActivityGraphService) as unknown as Mocked<ActivityGraphService>;
        graphNodeService = unitRef.get(ActivityGraphNodeService) as unknown as Mocked<ActivityGraphNodeService>;

        void graphNodeService.getExtension.mockResolvedValue(FAKE_GENERATOR);
        void graphService.getOwnerActor.mockResolvedValue({
            get: (key: string) => (key === 'id' ? FAKE_ACTOR_ID : undefined),
        } as never);
        stableKeyService.createASObjectStableKey.mockImplementation(
            (type, data) => `object:${type}:${String(data['identifier'])}`,
        );
    });

    it('builds a Listen activity with a MusicRecording for a track', () => {
        const [activity] = transform([TRACK_ROW]);

        expect(activity).toMatchObject({
            '@type': 'Listen',
            '@secondaryTypes': ['SpotifyListenActivity'],
            generator: FAKE_GENERATOR,
            actor: { '@id': FAKE_ACTOR_ID, '@type': 'Person' },
            stableKeys: ['spotify:play:2024-03-10T18:04:30Z:spotify:track:0000000000000000000001:210500'],
            summary: 'Listened to "Paper Lanterns" by The Example Band',
            mediaType: 'audio',
            msPlayed: 210_500,
            platform: 'android',
            connCountry: 'DE',
            reasonStart: 'trackdone',
            reasonEnd: 'trackdone',
            shuffle: true,
            skipped: false,
            offline: true,
            offlineTimestamp: '2024-03-10T18:01:00Z',
            incognitoMode: false,
        });
        expect(String(activity.startTime)).toBe('2024-03-10T18:00:59.500Z');
        expect(String(activity.endTime)).toBe('2024-03-10T18:04:30.000Z');
        expect(activity.object).toEqual({
            '@type': 'Audio',
            '@secondaryTypes': ['MusicRecording', 'SpotifyTrack'],
            stableKeys: ['object:Audio:spotify:track:0000000000000000000001'],
            identifier: 'spotify:track:0000000000000000000001',
            name: 'Paper Lanterns',
            byArtist: 'The Example Band',
            inAlbum: 'Night Market',
        });
    });

    it('builds a PodcastEpisode object for an episode', () => {
        const [activity] = transform([EPISODE_ROW]);

        expect(activity.summary).toBe('Listened to "Episode 12: Testing Things" (The Fake Podcast)');
        expect(activity.object).toEqual({
            '@type': 'Audio',
            '@secondaryTypes': ['PodcastEpisode', 'SpotifyEpisode'],
            stableKeys: ['object:Audio:spotify:episode:0000000000000000000002'],
            identifier: 'spotify:episode:0000000000000000000002',
            name: 'Episode 12: Testing Things',
            showName: 'The Fake Podcast',
        });
    });

    it('builds an AudiobookChapter object for an audiobook', () => {
        const [activity] = transform([AUDIOBOOK_ROW]);

        expect(activity.summary).toBe('Listened to audiobook "The Imaginary Case": Chapter 1');
        expect(activity.object).toEqual({
            '@type': 'Audio',
            '@secondaryTypes': ['AudiobookChapter', 'SpotifyAudiobookChapter'],
            stableKeys: ['object:Audio:spotify:episode:0000000000000000000004'],
            identifier: 'spotify:episode:0000000000000000000004',
            name: 'Chapter 1',
            audiobookTitle: 'The Imaginary Case',
            audiobookUri: 'spotify:show:0000000000000000000003',
        });
    });

    it('turns plays from the video history into views of their own video node', () => {
        const [video] = transform([VIDEO_TRACK_ROW], 'video');

        expect(video).toMatchObject({ '@type': 'View', mediaType: 'video', skipped: true });
        expect(video.summary).toBe('Watched "Musical Number (Live)" by Stage Cast');
        expect(video).not.toHaveProperty('offline');
        expect(video.object?.['@secondaryTypes']).toEqual(['SpotifyVideo']);
        expect(video.object?.stableKeys).toEqual(['object:Video:spotify:track:0000000000000000000005']);
    });

    it('emits rows without a URI without an object', () => {
        const [activity] = transform([NO_URI_ROW], 'video');

        expect(activity).not.toHaveProperty('object');
        expect(activity.stableKeys).toEqual(['spotify:play:2025-01-02T11:42:36Z:unknown:android:4677']);
    });

    it('skips malformed rows and keeps the rest of the file', () => {
        const activities = transform([TRACK_ROW, null, { ...EPISODE_ROW, ts: 'garbage' }, EPISODE_ROW]);

        expect(activities).toHaveLength(2);
    });

    it('keeps the IP address on the play', () => {
        const activities = transform([TRACK_ROW, EPISODE_ROW, AUDIOBOOK_ROW]);

        expect(activities.every((activity) => activity['ipAddress'] === '192.0.2.10')).toBe(true);
    });

    it('reports skipped and repeated rows', () => {
        const { skipped } = module.transformStreamingHistory(
            JSON.stringify([TRACK_ROW, { ...TRACK_ROW, ip_addr: '198.51.100.7' }, null]),
            'audio',
            FAKE_GENERATOR,
            FAKE_ACTOR_ID,
        );

        expect(skipped).toEqual({ total: 2, byReason: { 'not-an-object': 1, 'duplicate-row': 1 } });
    });

    it('turns video history plays into views of a Spotify video', () => {
        const [activity] = transform([TRACK_ROW], 'video');

        expect(activity['@type']).toBe('View');
        expect(activity['@secondaryTypes']).toEqual(['SpotifyViewActivity']);
        expect(activity['object']).toMatchObject({ '@type': 'Video', '@secondaryTypes': ['SpotifyVideo'] });
    });

    it('reads the asset and derives the media type from the file name', async () => {
        void assetService.getAssetString.mockResolvedValue(JSON.stringify([VIDEO_TRACK_ROW]));

        const { activities } = await module.executeModule({
            em: {} as EntityManager,
            inputData: {
                streamingHistoryFile: { originalFilename: 'Streaming_History_Video_2022.json' } as AssetDto,
            },
            progress: NOOP_MODULE_PROGRESS_REPORTER,
        } as never);

        expect(activities).toHaveLength(1);
        expect((activities[0] as unknown as ActivityRecord).mediaType).toBe('video');
        expect(graphNodeService.getExtension).toHaveBeenCalledWith(expect.anything(), expect.any(String));
    });

    describe('resolveMediaType', () => {
        it('prefers the configured value and falls back to the file name', () => {
            expect(resolveMediaType('audio', 'Streaming_History_Video_2022.json')).toBe('audio');
            expect(resolveMediaType(undefined, 'Streaming_History_Video_2022.json')).toBe('video');
            expect(resolveMediaType(undefined, 'Streaming_History_Audio_2022_1.json')).toBe('audio');
            expect(resolveMediaType('nonsense', 'whatever.json')).toBe('audio');
        });
    });

    describe('detectFile', () => {
        const sample = (fileName: string, head: string): FileSample => ({
            relativePath: `my_spotify_data/Spotify Extended Streaming History/${fileName}`,
            fileName,
            extension: 'json',
            size: head.length,
            head,
        });

        it('recognises audio and video history files', () => {
            const head = JSON.stringify([TRACK_ROW], null, 2);

            expect(module.detectFile(sample('Streaming_History_Audio_2024.json', head))).toEqual({
                confidence: 0.98,
                format: 'Spotify Extended Streaming History (audio)',
            });
            expect(module.detectFile(sample('Streaming_History_Video_2024.json', head))?.format).toBe(
                'Spotify Extended Streaming History (video)',
            );
            expect(module.detectFile(sample('renamed.json', head))?.confidence).toBe(0.9);
        });

        it('ignores the short account-data history and other JSON', () => {
            const shortHistory = JSON.stringify([
                { endTime: '2024-01-01 10:00', artistName: 'A', trackName: 'B', msPlayed: 1000 },
            ]);

            expect(module.detectFile(sample('StreamingHistory_music_0.json', shortHistory))).toBeUndefined();
            expect(module.detectFile(sample('other.json', '{"ts": 1}'))).toBeUndefined();
            expect(
                module.detectFile({ ...sample('Streaming_History_Audio_2024.json', 'x'), extension: 'txt' }),
            ).toBeUndefined();
        });
    });
});
