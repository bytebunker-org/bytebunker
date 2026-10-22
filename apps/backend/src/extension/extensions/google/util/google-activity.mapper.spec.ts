import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { DateTime } from 'luxon';
import type { ASObject } from '@bytebunker/event-schema';
import { YouTubeProductEnum } from '@bytebunker/event-schema/extension/youtube';
import { ActivityStableKeyService } from '../../../../activity-graph/activity-stable-key.service.js';
import { setGlobalSettings } from '../../../../shared/setting/global-setting.constant.js';
import { buildYouTubeListenActivity, buildYouTubeViewActivity } from '../../youtube/util/youtube-activity.builder.js';
import { parseGoogleActivityHtml } from './google-activity-html.parser.js';
import { GoogleActivityMapper, mapGoogleActivityEntries, unwrapGoogleRedirect } from './google-activity.mapper.js';

const fixture = (name: string): string =>
    readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '__fixtures__', name), 'utf8');

const generator = { '@id': 'extension/google', '@type': 'Extension' } as unknown as ASObject;
const stableKeyService = new ActivityStableKeyService(undefined as never, undefined as never);

type Activity = Record<string, any>;

describe('GoogleActivityMapper', () => {
    let german: Activity[];
    let english: Activity[];
    const find = (list: Activity[], actionText: string): Activity =>
        list.find((activity) => activity['actionText'].startsWith(actionText))!;

    beforeAll(() => {
        setGlobalSettings({
            eventUniqueLocationPrecisionSetting: 5,
            eventUniqueDateTimePrecisionSetting: 'second',
        } as Parameters<typeof setGlobalSettings>[0]);
        const mapper = new GoogleActivityMapper(stableKeyService, generator, 'owner');
        german = mapGoogleActivityEntries(
            mapper,
            parseGoogleActivityHtml(fixture('meine-aktivitaeten.fixture.html')).entries,
        ).activities;
        english = mapGoogleActivityEntries(
            mapper,
            parseGoogleActivityHtml(fixture('my-activity.fixture.html')).entries,
        ).activities;
    });

    it('gives every activity a unique identity key, owner actor and product', () => {
        for (const activity of [...german, ...english]) {
            expect(activity['stableKeys'][0]).toMatch(
                /^google-activity:[^:]+:\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z:[\da-f]{16}$/,
            );
            expect(activity['actor']).toEqual({ '@id': 'owner', '@type': 'Person' });
            expect(activity['googleProduct']).toBeTruthy();
            expect(activity['@secondaryTypes']).toContain('GoogleMyActivity');
        }

        const keys = [...german, ...english].map((activity) => activity['stableKeys'][0]);
        expect(new Set(keys).size).toBe(keys.length);
        expect(german[0]!['stableKeys'][0]).toMatch(/^google-activity:Google Suche:2025-02-03T11:05:32Z:/);
    });

    it('maps searches to Search with query, results page and caption location', () => {
        const search = german[0]!;
        expect(search).toMatchObject({
            '@type': 'Search',
            query: 'wetter musterstadt',
            pageUrl: 'https://www.google.com/search?q=wetter+musterstadt',
            action: 'searched',
            actionText: 'Gesucht nach: wetter musterstadt',
            location: { '@type': 'Place', latitude: 50.123_456, longitude: 7.654_321, precision: 'area' },
        });
        expect(search['startTime'].toISO()).toBe('2025-02-03T12:05:32.000+01:00');
        expect(find(german, 'wie spät')).toMatchObject({ '@type': 'Search', action: 'said', query: 'wie spät ist es' });
    });

    it('maps Maps routes to Search with origin, waypoints and destination', () => {
        expect(find(german, 'Route nach')).toMatchObject({
            '@type': 'Search',
            query: 'Teststraße 1, 12345 Musterstadt',
            originName: 'Bahnhof Musterstadt',
            waypointNames: ['Café Beispiel'],
            destinationName: 'Teststraße 1, 12345 Musterstadt',
        });
        expect(find(english, 'Directions to')).toMatchObject({
            originName: 'Current location',
            destinationName: 'Example Junction',
        });
    });

    it('builds YouTube views and music listens with the watch history keys', () => {
        const view = find(german, 'Ein Testvideo');
        const listen = find(german, 'Testlied');
        const watchedAt = DateTime.fromISO('2025-02-03T09:30:27.000+01:00', { setZone: true }) as DateTime<true>;
        const context = { stableKeyService, generator, actorId: 'owner' };
        const fromWatchHistory = buildYouTubeViewActivity(
            {
                product: YouTubeProductEnum.YOUTUBE,
                videoId: 'AAAAAAAAAA1',
                videoUrl: 'https://www.youtube.com/watch?v=AAAAAAAAAA1',
                title: 'Ein Testvideo',
                watchedAt: watchedAt.toISO(),
            },
            watchedAt,
            context,
        );

        expect(view['@type']).toBe('View');
        expect(view['@secondaryTypes']).toEqual(['YouTubeViewActivity', 'GoogleMyActivity']);
        expect(view['stableKeys'].slice(1)).toEqual(fromWatchHistory.stableKeys);
        expect(view['object']).toMatchObject({
            '@type': 'Video',
            videoId: 'AAAAAAAAAA1',
            channelName: 'Testkanal',
            channelId: 'UC00000000000000000000A1',
        });

        const listenedAt = DateTime.fromISO('2025-02-03T12:08:18.000+01:00', { setZone: true }) as DateTime<true>;
        const listenFromWatchHistory = buildYouTubeListenActivity(
            {
                product: YouTubeProductEnum.YOUTUBE_MUSIC,
                videoId: 'MMMMMMMMMM1',
                videoUrl: 'https://music.youtube.com/watch?v=MMMMMMMMMM1',
                title: 'Testlied',
                watchedAt: listenedAt.toISO(),
            },
            listenedAt,
            context,
        );
        expect(listen['@type']).toBe('Listen');
        expect(listen['stableKeys'].slice(1)).toEqual(listenFromWatchHistory.stableKeys);
        expect(listen['object']).toMatchObject({ '@type': 'Audio', byArtist: 'Testband' });
    });

    it('maps Maps place and region views to View of Place', () => {
        expect(find(german, 'Testmarkt')['object']).toMatchObject({
            '@type': 'Place',
            name: 'Testmarkt',
            googleFeatureId: '0x47957b663828e899:0x81db0419a0f3bd5b',
        });
        expect(find(german, 'Angesehene Region')['object']).toMatchObject({
            '@type': 'Place',
            latitude: 50.277_357_7,
            longitude: 7.599_554_1,
        });
        expect(find(english, 'Example Stable')['object']).toMatchObject({
            '@type': 'Place',
            name: 'Example Stable',
            googleFeatureId: '0x47a28ba901814275:0xe95253619442e5cd',
        });
    });

    it('maps page visits to View of Page with the redirect unwrapped', () => {
        expect(find(german, 'Beispielartikel')).toMatchObject({
            '@type': 'View',
            action: 'visited',
            details: ['Weitergeleitet von: example.net'],
            object: { '@type': 'Page', name: 'Beispielartikel – Example', pageUrl: 'https://example.org/artikel/1' },
        });
        expect(find(english, 'Visited')['object']).toMatchObject({ pageUrl: 'http://example.com/page' });
    });

    it('maps app usage to View of Page with the action', () => {
        expect(find(german, 'Verwendet')).toMatchObject({
            '@type': 'View',
            action: 'used',
            googleProduct: 'Google Play Store',
            googleHeader: 'Beispiel Banking App',
            object: { '@type': 'Page', packageName: 'org.example.banking' },
        });
        expect(find(english, 'Used')['object']).toMatchObject({ '@type': 'Page', name: 'org.example.messenger' });
        expect(find(english, 'Installed')).toMatchObject({
            action: 'installed',
            object: { packageName: 'org.example.app' },
        });
    });

    it('maps Gemini prompts to Create of a Note with the response', () => {
        expect(find(german, 'Eingegebener Prompt')).toMatchObject({
            '@type': 'Create',
            object: { '@type': 'Note', content: 'Was ist ein Testprompt?' },
            responseText: 'Ein Testprompt ist ein Beispiel.\nErster Punkt',
            attachmentFiles: ['image-0000000000000001.png'],
        });
    });

    it('maps Play Music to Listen of an Audio with artist', () => {
        expect(find(english, 'Listened to')).toMatchObject({
            '@type': 'Listen',
            object: { '@type': 'Audio', name: 'Example Sonata No. 1', byArtist: 'Example Pianist' },
        });
    });

    it('keeps entries without object as View with the raw action', () => {
        const removed = find(english, 'Watched a video that has been removed');
        expect(removed['@type']).toBe('View');
        expect(removed['object']).toBeUndefined();
        expect(find(german, '2 Benachrichtigungen')).toMatchObject({ '@type': 'View', action: 'notification' });
        expect(find(german, 'Versucht')).toMatchObject({ action: 'paid', location: { latitude: 50.222_222 } });
        expect(find(german, 'Versucht')['details']).toBeUndefined();
    });

    it('drops exact repeats of an entry', () => {
        const mapper = new GoogleActivityMapper(stableKeyService, generator, 'owner');
        const entries = parseGoogleActivityHtml(fixture('meine-aktivitaeten.fixture.html')).entries;
        const result = mapGoogleActivityEntries(mapper, [...entries, entries[0]!]);

        expect(result.duplicates).toBe(1);
        expect(result.activities).toHaveLength(entries.length);
    });

    it('unwraps Google redirect links only', () => {
        expect(unwrapGoogleRedirect('https://www.google.com/url?q=https://a.example/b?c%3Dd&usg=x')).toBe(
            'https://a.example/b?c=d',
        );
        expect(unwrapGoogleRedirect('https://a.example/url?q=1')).toBe('https://a.example/url?q=1');
    });
});
