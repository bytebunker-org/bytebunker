import { beforeEach, describe, expect, it } from 'vitest';
import { TestBed } from '@suites/unit';
import type { Mocked } from '@suites/doubles.vitest';
import type { ASObject } from '@bytebunker/event-schema';
import { TransformAirbnbExportPipelineModule } from './transform-airbnb-export.pipeline-module.js';
import { ActivityStableKeyService } from '../../../../activity-graph/activity-stable-key.service.js';
import { AssetService } from '../../../../etl/asset/asset.service.js';
import { ActivityGraphService } from '../../../../activity-graph/activity-graph.service.js';
import { ActivityGraphNodeService } from '../../../../activity-graph/activity-graph-node.service.js';
import {
    MESSAGES_FILE,
    RESERVATIONS_FILE,
    REVIEWS_FILE,
    SEARCH_HISTORY_FILE,
    SINGLE_THREAD_MESSAGES_FILE,
    WISHLISTS_FILE,
} from './transform-airbnb-export.fixture.js';

const FAKE_ACTOR_ID = '00000000-0000-0000-0000-0000000000aa';
const FAKE_GENERATOR: ASObject = { '@id': '00000000-0000-0000-0000-0000000000bb', '@type': 'Application' };

type Out = any;

describe('TransformAirbnbExportPipelineModule', () => {
    let module: TransformAirbnbExportPipelineModule;
    let stableKeyService: Mocked<ActivityStableKeyService>;

    const run = (parsed: unknown, options = {}): Out[] =>
        module.transformExport(parsed, FAKE_GENERATOR, FAKE_ACTOR_ID, options) as unknown as Out[];

    beforeEach(async () => {
        const { unit, unitRef } = await TestBed.solitary(TransformAirbnbExportPipelineModule).compile();

        module = unit;
        stableKeyService = unitRef.get(ActivityStableKeyService) as unknown as Mocked<ActivityStableKeyService>;
        // Referenced so the other collaborators are mocked; the module only needs the stable key service here.
        unitRef.get(AssetService);
        unitRef.get(ActivityGraphService);
        unitRef.get(ActivityGraphNodeService);
        stableKeyService.createASObjectStableKey.mockImplementation(
            (type, data) => `${type}:${JSON.stringify(data)}` as never,
        );
    });

    describe('detectFile', () => {
        const sample = (head: string, extension = 'json') =>
            ({
                relativePath: `x.${extension}`,
                fileName: `x.${extension}`,
                extension,
                size: head.length,
                head,
            }) as never;

        it.each([
            ['[\n  {\n    "bookingSessions": [', 'reservations'],
            ['[{"reservations":[', 'reservations'],
            ['[\n  {\n    "servicedata": [', 'search history'],
            ['[\n  {\n    "messageThreads": [', 'messages'],
            ['﻿[ { "reviewsReceived": [', 'reviews'],
        ])('recognises %s', (head, label) => {
            const detection = module.detectFile(sample(head));

            expect(detection?.confidence).toBeGreaterThanOrEqual(0.9);
            expect(detection?.format).toContain(label);
        });

        it('ignores other json and non-json files', () => {
            expect(module.detectFile(sample('[{"wishlistData": []}]'))).toBeUndefined();
            expect(module.detectFile(sample('{"semanticSegments": []}'))).toBeUndefined();
            expect(module.detectFile(sample('[{"servicedata": []}]', 'txt'))).toBeUndefined();
        });
    });

    describe('reservations', () => {
        it('builds an all-day Stay anchored at local midnight, accepted only by default', () => {
            const stays = run(RESERVATIONS_FILE);

            expect(stays).toHaveLength(2);
            const [stay] = stays;
            expect(stay['@type']).toBe('Event');
            expect(stay['@secondaryTypes']).toEqual(['Stay']);
            expect(stay.summary).toBe('Airbnb stay (3 nights)');
            expect(stay.allDay).toBe(true);
            expect(stay.startTime.toISO()).toBe('2021-07-10T00:00:00.000+02:00');
            expect(stay.endTime.toISO()).toBe('2021-07-13T00:00:00.000+02:00');
            expect(stay.stableKeys).toEqual(['airbnb:reservation:HMTESTAAA1']);
            expect(stay).toMatchObject({
                status: 'accepted',
                nights: 3,
                guests: 2,
                confirmationCode: 'HMTESTAAA1',
                bookedAt: '2021-06-01T08:30:00.000Z',
                checkinFromHour: 15,
                checkinToHour: 20,
                guestMessage: 'Hello, we arrive by train.',
                hostProfileUrl: 'https://www.airbnb.com/users/show/2002',
                listingUrl: 'https://www.airbnb.com/rooms/555001',
                listingId: '555001',
            });
            expect(stay.location).toMatchObject({
                '@type': 'Place',
                '@secondaryTypes': ['AirbnbListing'],
                name: 'Airbnb listing 555001',
                identifier: 'airbnb:listing:555001',
                listingUrl: 'https://www.airbnb.com/rooms/555001',
            });
            expect(stableKeyService.createASObjectStableKey).toHaveBeenCalledWith('Place', {
                identifier: 'airbnb:listing:555001',
            });
        });

        it('handles stays without listing and singular nights', () => {
            const stays = run(RESERVATIONS_FILE, { includeCancelled: true });
            const noListing = stays.find((s) => s.confirmationCode === 'HMTESTCCC3')!;
            const cancelled = stays.find((s) => s.confirmationCode === 'HMTESTBBB2')!;

            expect(stays).toHaveLength(3);
            expect(noListing.location).toBeUndefined();
            expect(cancelled.summary).toBe('Airbnb stay (1 night)');
            expect(cancelled.status).toBe('cancelled');
            expect(cancelled.canceledAt).toBe('2021-12-20T09:00:00.000Z');
        });

        it('uses the configured timezone and survives DST changes', () => {
            const [, dstStay] = run(RESERVATIONS_FILE, { timezone: 'America/New_York' });

            expect(dstStay.startTime.toISO()).toBe('2022-03-26T00:00:00.000-04:00');
            expect(dstStay.endTime.toISO()).toBe('2022-03-28T00:00:00.000-04:00');
            // Berlin switches to summer time on 2022-03-27: the stay still ends at local midnight.
            const [, berlin] = run(RESERVATIONS_FILE);
            expect(berlin.endTime.toISO()).toBe('2022-03-28T00:00:00.000+02:00');
        });
    });

    describe('search history', () => {
        it('builds Search activities with a location and skips rows without one', () => {
            const searches = run(SEARCH_HISTORY_FILE);

            expect(searches).toHaveLength(1);
            expect(searches[0]['@type']).toBe('Search');
            expect(searches[0].query).toBe('Testville, Exampleland');
            expect(searches[0].startTime.toISO()).toBe('2024-08-27T20:39:27.000Z');
            expect(searches[0].stableKeys).toEqual(['airbnb:search:2024-08-27T20:39:27.000Z:Testville, Exampleland']);
            expect(searches[0]).toMatchObject({ checkIn: '2024-08-27', checkOut: '2024-08-28', nights: 1, guests: 2 });
            expect(searches[0].location).toMatchObject({
                '@type': 'Place',
                name: 'Testville, Exampleland',
                latitude: 49.5,
                longitude: 6.5,
                summary: 'Testville, Testshire, Exampleland',
            });
        });
    });

    describe('messages', () => {
        it('detects the owner as the account in every thread and sets direction and targets', () => {
            const messages = run(MESSAGES_FILE);
            const byKey = (id: number) => messages.find((m) => m.stableKeys[0] === `airbnb:message:${id}`)!;

            const outgoing = byKey(1);
            expect(outgoing['@type']).toBe('Create');
            expect(outgoing['@secondaryTypes']).toEqual(['Message']);
            expect(outgoing.actor).toEqual({ '@id': FAKE_ACTOR_ID, '@type': 'Person' });
            expect(outgoing.direction).toBe('outgoing');
            expect(outgoing.conversationId).toBe('airbnb:thread:9001');
            expect(outgoing.contentType).toBe('TextContent');
            expect(outgoing.object).toEqual({ '@type': 'Note', content: 'Is parking available?' });
            expect(outgoing.target).toMatchObject({
                '@type': 'Person',
                stableKeys: ['person:handle:airbnb:2002'],
                profileUrl: 'https://www.airbnb.com/users/show/2002',
            });

            const incoming = byKey(2);
            expect(incoming.direction).toBe('incoming');
            expect(incoming.actor.stableKeys).toEqual(['person:handle:airbnb:2002']);
            expect(incoming.target).toEqual({ '@id': FAKE_ACTOR_ID, '@type': 'Person' });
            expect(incoming.object.content).toBe('Yes, in the yard.');
            expect(incoming).toMatchObject({ referenceType: 'home_booking', referenceId: '777' });
        });

        it('keeps booking events, v2 content and attachments, drops technical entries', () => {
            const messages = run(MESSAGES_FILE);
            const content = (id: number) =>
                messages.find((m) => m.stableKeys[0] === `airbnb:message:${id}`)?.object.content;

            expect(content(3)).toBe('[trust_education]');
            expect(content(4)).toBe('Great, thanks.');
            expect(content(5)).toBeUndefined();
            expect(content(6)).toBe('[attachment]');
            expect(content(7)).toBeUndefined();
            expect(content(8)).toBe('[home_booking]');
            expect(messages.find((m) => m.stableKeys[0] === 'airbnb:message:3')!.actor.stableKeys).toEqual([
                'person:handle:airbnb:service',
            ]);
        });

        it('leaves out the target of outgoing messages in group threads', () => {
            const messages = run(MESSAGES_FILE);
            const reply = messages.find((m) => m.stableKeys[0] === 'airbnb:message:12')!;

            expect(reply.direction).toBe('outgoing');
            expect(reply.target).toBeUndefined();
        });

        it('imports without direction when the owner is ambiguous, and honours ownerAccountId', () => {
            const ambiguous = run(SINGLE_THREAD_MESSAGES_FILE);
            expect(ambiguous).toHaveLength(1);
            expect(ambiguous[0].direction).toBeUndefined();
            expect(ambiguous[0].target).toBeUndefined();
            expect(ambiguous[0].actor.stableKeys).toEqual(['person:handle:airbnb:1001']);

            const [explicit] = run(SINGLE_THREAD_MESSAGES_FILE, { ownerAccountId: '1001' });
            expect(explicit.direction).toBe('outgoing');
            expect(explicit.actor).toEqual({ '@id': FAKE_ACTOR_ID, '@type': 'Person' });
            expect(explicit.target.stableKeys).toEqual(['person:handle:airbnb:2002']);
        });
    });

    describe('reviews', () => {
        it('builds received and written reviews with the owner on the right side', () => {
            const reviews = run(REVIEWS_FILE);

            expect(reviews.map((r) => r.stableKeys[0])).toEqual([
                'airbnb:review:5001',
                'airbnb:review:5002',
                'airbnb:review:6001',
            ]);

            const [received, , written] = reviews;
            expect(received['@type']).toBe('Create');
            expect(received['@secondaryTypes']).toEqual(['Review']);
            expect(received.actor.stableKeys).toEqual(['person:handle:airbnb:2002']);
            expect(received.target).toEqual({ '@id': FAKE_ACTOR_ID, '@type': 'Person' });
            expect(received.object).toEqual({ '@type': 'Note', content: 'Pleasant guest.' });
            expect(received.startTime.toISO()).toBe('2021-07-14T10:00:00.000Z');
            expect(received).toMatchObject({
                rating: 5,
                recommended: true,
                reviewerRole: 'HOST',
                revieweeRole: 'GUEST',
                language: 'en',
            });
            expect(received.categoryRatings).toEqual([
                { ratingCategory: 'COMMUNICATION', ratingV2: 5 },
                { ratingCategory: 'CLEANLINESS', ratingV2: 4 },
            ]);

            expect(written.actor).toEqual({ '@id': FAKE_ACTOR_ID, '@type': 'Person' });
            expect(written.target.stableKeys).toEqual(['person:handle:airbnb:3003']);
        });

        it('falls back to createdAt and skips reviews without any date', () => {
            const reviews = run(REVIEWS_FILE);

            expect(reviews[1].startTime.toISO()).toBe('2021-08-01T10:00:00.000Z');
            expect(reviews.some((r) => r.stableKeys[0] === 'airbnb:review:5003')).toBe(false);
        });
    });

    describe('unsupported files', () => {
        it('returns no activities for other export files and odd input', () => {
            expect(run(WISHLISTS_FILE)).toEqual([]);
            expect(run([])).toEqual([]);
            expect(run({})).toEqual([]);
            expect(run('text')).toEqual([]);
            expect(run(null)).toEqual([]);
        });
    });
});
