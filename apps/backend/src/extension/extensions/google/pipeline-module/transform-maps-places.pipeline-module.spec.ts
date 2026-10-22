import { beforeEach, describe, expect, it } from 'vitest';
import { TestBed } from '@suites/unit';
import type { Mocked } from '@suites/doubles.vitest';
import type { EntityManager } from '@mikro-orm/postgresql';
import type { ASObject } from '@bytebunker/event-schema';
import { TransformMapsPlacesPipelineModule } from './transform-maps-places.pipeline-module.js';
import { NOOP_MODULE_PROGRESS_REPORTER } from '../../../../etl/pipeline/progress/type/module-progress-reporter.interface.js';
import type { AssetDto } from '../../../../etl/asset/dto/asset.dto.js';
import type { FileSample } from '../../../../etl/import/type/file-detection.interface.js';
import { AssetService } from '../../../../etl/asset/asset.service.js';
import { ActivityStableKeyService } from '../../../../activity-graph/activity-stable-key.service.js';
import { ActivityGraphService } from '../../../../activity-graph/activity-graph.service.js';
import { ActivityGraphNodeService } from '../../../../activity-graph/activity-graph-node.service.js';
import { extractCid } from '../util/google-maps-places.parser.js';
import { LABELED_PLACES_EN, REVIEWS_DE, REVIEWS_EN, SAVED_PLACES_DE } from './transform-maps-places.fixture.js';

const FAKE_ACTOR_ID = '00000000-0000-0000-0000-0000000000aa';
const FAKE_GENERATOR: ASObject = { '@id': '00000000-0000-0000-0000-0000000000bb', '@type': 'Application' };

const sample = (fileName: string, head: string): FileSample => ({
    relativePath: `Maps/${fileName}`,
    fileName,
    extension: 'json',
    size: head.length,
    head,
});

type Loose = Record<string, any>;

describe('TransformMapsPlacesPipelineModule', () => {
    let module: TransformMapsPlacesPipelineModule;
    let assetService: Mocked<AssetService>;

    beforeEach(async () => {
        const { unit, unitRef } = await TestBed.solitary(TransformMapsPlacesPipelineModule).compile();

        module = unit;
        assetService = unitRef.get(AssetService) as unknown as Mocked<AssetService>;
        const stableKeyService = unitRef.get(ActivityStableKeyService) as unknown as Mocked<ActivityStableKeyService>;
        const graphService = unitRef.get(ActivityGraphService) as unknown as Mocked<ActivityGraphService>;
        const graphNodeService = unitRef.get(ActivityGraphNodeService) as unknown as Mocked<ActivityGraphNodeService>;

        void graphNodeService.getExtension.mockResolvedValue(FAKE_GENERATOR);
        void graphService.getOwnerActor.mockResolvedValue({
            get: (key: string) => (key === 'id' ? FAKE_ACTOR_ID : undefined),
        } as never);
        stableKeyService.createASObjectStableKey.mockImplementation(
            (type, data) => `${type}:${JSON.stringify(data)}` as never,
        );
    });

    async function run(fileName: string, content: string): Promise<Loose[]> {
        void assetService.getAssetString.mockResolvedValue(content);

        const output = await module.executeModule({
            em: {} as EntityManager,
            inputData: { placesFile: { originalFilename: fileName } as AssetDto },
            progress: NOOP_MODULE_PROGRESS_REPORTER,
        } as never);

        return output.activities as unknown as Loose[];
    }

    describe('detectFile', () => {
        it('detects German and English saved places and reviews', () => {
            expect(module.detectFile(sample('Gespeicherte Orte.json', SAVED_PLACES_DE))?.format).toContain('saved');
            expect(module.detectFile(sample('Bewertungen.json', REVIEWS_DE))?.format).toContain('reviews');
            expect(module.detectFile(sample('Reviews.json', REVIEWS_EN))?.format).toContain('reviews');
            // content alone is enough
            expect(module.detectFile(sample('x.json', REVIEWS_DE))?.confidence).toBeGreaterThanOrEqual(0.9);
        });

        it('ignores labeled places, other JSON and other extensions', () => {
            expect(module.detectFile(sample('Labeled places.json', LABELED_PLACES_EN))).toBeUndefined();
            expect(module.detectFile(sample('Bewertungen.json', '{"reviews":[]}'))).toBeUndefined();
            expect(module.detectFile({ ...sample('a.csv', SAVED_PLACES_DE), extension: 'csv' })).toBeUndefined();
        });
    });

    describe('saved places', () => {
        it('turns features into Add + SavedPlace activities', async () => {
            const activities = await run('Gespeicherte Orte.json', SAVED_PLACES_DE);

            // the fourth fixture feature has no date and is skipped
            expect(activities).toHaveLength(3);

            const first = activities[0]!;
            expect(first['@type']).toBe('Add');
            expect(first['@secondaryTypes'].map((t: Loose) => t['@type'] ?? t)).toContain('SavedPlace');
            expect(first['stableKeys']).toEqual(['google-maps:saved:1234567890123456789:2024-08-26T03:49:31.000Z']);
            expect(first['actor']).toEqual({ '@id': FAKE_ACTOR_ID, '@type': 'Person' });
            expect(first['startTime'].toUTC().toISO()).toBe('2024-08-26T03:49:31.000Z');
            expect(first['object']).toMatchObject({
                '@type': 'Place',
                name: 'Beispiel Hostel',
                address: '1 Beispielweg, 12345 Musterstadt, Frankreich',
                summary: '1 Beispielweg, 12345 Musterstadt, Frankreich',
                latitude: 48.5,
                longitude: 2.5,
                cid: '1234567890123456789',
                countryCode: 'FR',
                mapsUrl: 'http://maps.google.com/?cid=1234567890123456789',
            });
            expect(first['object'].stableKeys).toEqual([
                'Place:{"cid":"1234567890123456789"}',
                'Place:{"lat":48.5,"lng":2.5}',
            ]);
        });

        it('drops [0, 0] coordinates and falls back to ?q= coordinates, ftid cid and query name', async () => {
            const [, byCoordinates, byFtid] = await run('Gespeicherte Orte.json', SAVED_PLACES_DE);

            expect(byCoordinates!['object']).toMatchObject({ latitude: 49.5, longitude: 6.25 });
            expect(byCoordinates!['object'].cid).toBeUndefined();
            expect(byCoordinates!['stableKeys'][0]).toContain('http://maps.google.com/?q=49.5,6.25');

            expect(byFtid!['object'].latitude).toBeUndefined();
            expect(byFtid!['object'].name).toBe('Teststadt, 11111 Teststadt');
            expect(byFtid!['object'].cid).toBe('255');
            expect(byFtid!['object'].stableKeys).toEqual(['Place:{"cid":"255"}']);
        });

        it('skips features without a date', async () => {
            const activities = await run('Gespeicherte Orte.json', SAVED_PLACES_DE);

            expect(activities.every((a) => a['startTime'])).toBe(true);
            expect(activities.map((a) => a['object'].cid)).not.toContain('1');
        });
    });

    describe('reviews', () => {
        it('turns German reviews into Create + Review with a Note and rating', async () => {
            const activities = await run('Bewertungen.json', REVIEWS_DE);

            expect(activities).toHaveLength(2);

            const [withText, withoutText] = activities;
            expect(withText!['@type']).toBe('Create');
            expect(withText!['rating']).toBe(4);
            expect(withText!['stableKeys']).toEqual(['google-maps:review:255:2024-05-15T08:36:40.925Z']);
            expect(withText!['object']).toMatchObject({ '@type': 'Note', content: 'Nett und schnell.' });
            expect(withText!['target']).toMatchObject({ '@type': 'Place', name: 'Testsalon', cid: '255' });

            expect(withoutText!['object']).toBeUndefined();
            expect(withoutText!['rating']).toBe(5);
        });

        it('reads the English export keys and shares the place key with the German export', async () => {
            const english = await run('Reviews.json', REVIEWS_EN);
            const german = await run('Bewertungen.json', REVIEWS_DE);

            expect(english).toHaveLength(2);
            expect(english[0]!['object']).toMatchObject({ content: 'Echt gut!' });
            expect(english[0]!['target'].stableKeys).toEqual(german[0]!['target'].stableKeys);
            // no location information: cid-only place, rating still imported
            expect(english[1]!['target']).toMatchObject({ cid: '42' });
            expect(english[1]!['target'].latitude).toBeUndefined();
            expect(english[1]!['rating']).toBe(3);
        });
    });

    describe('extractCid', () => {
        it('derives the decimal cid from cid=, ftid= and data parameters', () => {
            expect(extractCid('http://maps.google.com/?cid=17562169541173868400')).toBe('17562169541173868400');
            expect(extractCid('http://maps.google.com/?q=x&ftid=0x1:0xff')).toBe('255');
            expect(extractCid('https://www.google.com/maps/place//data=!4m2!3m1!1s0x0:0x100')).toBe('256');
            expect(extractCid('http://maps.google.com/?q=49.6,6.2')).toBeUndefined();
        });
    });
});
