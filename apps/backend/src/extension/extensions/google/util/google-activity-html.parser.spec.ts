import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { GoogleMyActivityActionEnum as Action } from '@bytebunker/event-schema/extension/google-my-activity';
import {
    iterateActivityCells,
    looksLikeTakeoutActivityHtml,
    parseGoogleActivityHtml,
} from './google-activity-html.parser.js';
import { parseGoogleMapsUrl } from './google-maps-url.util.js';

const fixture = (name: string): string =>
    readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '__fixtures__', name), 'utf8');

describe('parseGoogleActivityHtml (German)', () => {
    const html = fixture('meine-aktivitaeten.fixture.html');
    const result = parseGoogleActivityHtml(html);
    const byText = (prefix: string) => result.entries.find((entry) => entry.actionText.startsWith(prefix))!;

    it('parses every card and skips the one without timestamp', () => {
        expect(result.total).toBe(15);
        expect(result.entries).toHaveLength(14);
        expect(result.skipped).toEqual({ 'no-timestamp': 1 });
    });

    it('classifies each verb phrase', () => {
        expect(result.entries.map((entry) => entry.action)).toEqual([
            Action.SEARCHED,
            Action.VISITED,
            Action.SEARCHED,
            Action.WATCHED,
            Action.WATCHED,
            Action.VIEWED,
            Action.VIEWED,
            Action.DIRECTIONS,
            Action.USED,
            Action.NOTIFICATION,
            Action.PROMPTED,
            Action.SAID,
            Action.PAID,
            Action.OTHER,
        ]);
    });

    it('reads a search with link, product and an approximate area', () => {
        expect(result.entries[0]).toEqual({
            header: 'Google Suche',
            product: 'Google Suche',
            products: ['Google Suche'],
            action: Action.SEARCHED,
            actionText: 'Gesucht nach: wetter musterstadt',
            actionTemplate: 'Gesucht nach: {link}',
            title: 'wetter musterstadt',
            url: 'https://www.google.com/search?q=wetter+musterstadt',
            secondaryLinks: [],
            lines: [],
            timestamp: '2025-02-03T12:05:32.000+01:00',
            locations: [
                {
                    name: 'Ungefähre Gegend',
                    description: 'Ungefähre Gegend - Aus Meine Orte (Zuhause)',
                    latitude: 50.123_456,
                    longitude: 7.654_321,
                    precision: 'area',
                    mapsUrl: 'https://www.google.com/maps/@?api=1&map_action=map&center=50.123456,7.654321&zoom=12',
                },
            ],
            details: [],
            attachmentFiles: [],
        });
    });

    it('takes the query of an unlinked search from the verb phrase', () => {
        const entry = byText('Gesucht nach: bootstrap');
        expect(entry.title).toBe('bootstrap template');
        expect(entry.url).toBeUndefined();
        expect(entry.locations[0]).toMatchObject({ latitude: 50.111_111, longitude: 7.222_222, precision: 'place' });
    });

    it('parses MESZ and keeps details', () => {
        const entry = byText('Beispielartikel');
        expect(entry.timestamp).toBe('2024-07-15T18:30:00.000+02:00');
        expect(entry.details).toEqual(['Weitergeleitet von: example.net']);
        expect(entry.title).toBe('Beispielartikel – Example');
    });

    it('keeps the channel link of a YouTube view as secondary link', () => {
        const entry = byText('Ein Testvideo');
        expect(entry.secondaryLinks).toEqual([
            { text: 'Testkanal', url: 'https://www.youtube.com/channel/UC00000000000000000000A1' },
        ]);
        expect(byText('Testlied').header).toBe('YouTube Music');
        expect(byText('Testlied').product).toBe('YouTube');
    });

    it('keeps route stops and notification topics as lines', () => {
        expect(byText('Route nach').lines).toEqual([
            'Bahnhof Musterstadt',
            'Café Beispiel',
            'Teststraße 1, 12345 Musterstadt',
        ]);
        expect(byText('2 Benachrichtigungen').lines).toEqual(['Enthaltene Themen:', 'Fragen zu einem Ort beantworten']);
    });

    it('uses the caption product when the header is an app', () => {
        const entry = byText('Verwendet');
        expect(entry).toMatchObject({ header: 'Beispiel Banking App', product: 'Google Play Store' });
    });

    it('reads the Gemini response after the timestamp and local attachments', () => {
        const entry = byText('Eingegebener Prompt');
        expect(entry.title).toBe('Was ist ein Testprompt?');
        expect(entry.trailingText).toBe('Ein Testprompt ist ein Beispiel.\nErster Punkt');
        expect(entry.attachmentFiles).toEqual(['image-0000000000000001.png']);
        expect(byText('wie spät').attachmentFiles).toEqual(['2024-11-25_16_58_19_229_UTC.mp3']);
    });

    it('drops payment amounts from the details', () => {
        const entry = byText('Versucht');
        expect(entry.details).toEqual([]);
        expect(entry.locations).toHaveLength(1);
    });
});

describe('parseGoogleActivityHtml (English)', () => {
    const result = parseGoogleActivityHtml(fixture('my-activity.fixture.html'));

    it('classifies each verb phrase', () => {
        expect(result.skipped).toEqual({});
        expect(result.entries.map((entry) => [entry.action, entry.timestamp])).toEqual([
            [Action.SEARCHED, '2020-07-02T04:34:53.000+02:00'],
            [Action.VISITED, '2020-01-06T12:46:14.000+02:00'],
            [Action.WATCHED, '2018-07-07T02:45:40.000+02:00'],
            [Action.WATCHED, '2018-07-07T02:46:04.000+02:00'],
            [Action.LISTENED, '2019-04-15T20:57:23.000+02:00'],
            [Action.INSTALLED, '2025-02-03T12:08:18.000+01:00'],
            [Action.USED, '2025-02-03T12:08:18.000+01:00'],
            [Action.DIRECTIONS, '2020-03-08T22:59:36.000+02:00'],
            [Action.VIEWED, '2020-06-23T21:25:39.000+02:00'],
            [Action.OTHER, '2018-07-07T02:28:19.000+02:00'],
        ]);
    });

    it('reads both caption locations', () => {
        expect(result.entries[0]!.locations).toEqual([
            expect.objectContaining({ name: 'this area', precision: 'area', latitude: 50.123_456 }),
            expect.objectContaining({ name: 'this place', precision: 'place', latitude: 50.111_111 }),
        ]);
    });

    it('takes free-text subjects (artist line, package name)', () => {
        expect(result.entries[4]).toMatchObject({ title: 'Example Sonata No. 1', lines: ['Example Pianist'] });
        expect(result.entries[6]).toMatchObject({ title: 'org.example.messenger', product: 'Android' });
        expect(result.entries[3]!.url).toBeUndefined();
        expect(result.entries[9]!.details).toEqual(['Example detail']);
    });
});

describe('helpers', () => {
    it('cuts cards without parsing the document', () => {
        expect([
            ...iterateActivityCells('<p>x</p><div class="outer-cell a">1</div><div class="outer-cell b">2'),
        ]).toEqual(['<div class="outer-cell a">1</div>', '<div class="outer-cell b">2']);
    });

    it('recognises the activity HTML title', () => {
        expect(looksLikeTakeoutActivityHtml('<html><head><title>Mein Aktivitätsverlauf</title><style>')).toBe(true);
        expect(looksLikeTakeoutActivityHtml('<html><head><title>My Activity History</title>')).toBe(true);
        expect(looksLikeTakeoutActivityHtml('<html><head><title>Bookmarks</title>')).toBe(false);
    });

    it('parses Google Maps links', () => {
        expect(parseGoogleMapsUrl('http://maps.google.com/maps?ftid=0x31157a4d736a1e5f%3A0xb03bb0c9e2fe62be')).toEqual({
            kind: 'place',
            featureId: '0x31157a4d736a1e5f:0xb03bb0c9e2fe62be',
        });
        expect(parseGoogleMapsUrl('https://www.google.com/maps/@49.7595855,6.658322,2208.9a,30y')).toEqual({
            kind: 'viewport',
            latitude: 49.759_585_5,
            longitude: 6.658_322,
        });
        expect(
            parseGoogleMapsUrl('https://www.google.de/maps/place/Test+Platz/@49.75,6.64,19z/data=!4m2!3m1!1s0x47:0xcd'),
        ).toEqual({ kind: 'place', latitude: 49.75, longitude: 6.64, featureId: '0x47:0xcd', name: 'Test Platz' });
        expect(parseGoogleMapsUrl('https://www.google.com/maps/search/?api=1&query=49.1,6.2')).toEqual({
            kind: 'point',
            latitude: 49.1,
            longitude: 6.2,
        });
        expect(parseGoogleMapsUrl('https://www.google.com/search?q=maps')).toBeUndefined();
    });
});
