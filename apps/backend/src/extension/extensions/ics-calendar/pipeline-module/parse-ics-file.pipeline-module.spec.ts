import { beforeEach, describe, expect, it } from 'vitest';
import { TestBed } from '@suites/unit';
import type { Mocked } from '@suites/doubles.vitest';
import type { EntityManager } from '@mikro-orm/postgresql';
import type { ASObject, EventActivity, Place } from '@bytebunker/event-schema';
import { ParseIcsFilePipelineModule } from './parse-ics-file.pipeline-module.js';
import { NOOP_MODULE_PROGRESS_REPORTER } from '../../../../etl/pipeline/progress/type/module-progress-reporter.interface.js';
import { AssetService } from '../../../../etl/asset/asset.service.js';
import { ActivityStableKeyService } from '../../../../activity-graph/activity-stable-key.service.js';
import { ActivityGraphService } from '../../../../activity-graph/activity-graph.service.js';
import { ActivityGraphNodeService } from '../../../../activity-graph/activity-graph-node.service.js';
import { DateTime } from 'luxon';
import type { IcsEventActivityInterface } from '../type/ics-event-activity.interface.js';
import {
    ICS_APPLE_STRUCTURED_LOCATION,
    ICS_OUTLOOK_WITH_EXTENSIONS,
    ICS_WITH_RECURRING_SERIES,
    ICS_WITH_INVALID_VEVENT,
    ICS_WITH_LOCATION_AND_ATTENDEES,
    MINIMAL_ICS,
} from './parse-ics-file.fixture.js';

const FAKE_ACTOR_ID = '00000000-0000-0000-0000-0000000000aa';
const NOW = DateTime.fromISO('2025-06-01T00:00:00Z');
const FAKE_GENERATOR: ASObject = {
    '@id': '00000000-0000-0000-0000-0000000000bb',
    '@type': 'Application',
    name: 'ics-calendar',
};

describe('ParseIcsFilePipelineModule', () => {
    let module: ParseIcsFilePipelineModule;
    let assetService: Mocked<AssetService>;
    let stableKeyService: Mocked<ActivityStableKeyService>;
    let graphService: Mocked<ActivityGraphService>;
    let graphNodeService: Mocked<ActivityGraphNodeService>;

    beforeEach(async () => {
        const { unit, unitRef } = await TestBed.solitary(ParseIcsFilePipelineModule).compile();

        module = unit;
        assetService = unitRef.get(AssetService) as unknown as Mocked<AssetService>;
        stableKeyService = unitRef.get(ActivityStableKeyService) as unknown as Mocked<ActivityStableKeyService>;
        graphService = unitRef.get(ActivityGraphService) as unknown as Mocked<ActivityGraphService>;
        graphNodeService = unitRef.get(ActivityGraphNodeService) as unknown as Mocked<ActivityGraphNodeService>;

        graphNodeService.getExtension.mockResolvedValue(FAKE_GENERATOR);
        graphService.getOwnerActor.mockResolvedValue({
            get: (key: string) => (key === 'id' ? FAKE_ACTOR_ID : undefined),
        } as never);
        stableKeyService.createActivityStableKey.mockReturnValue('activity-stable-key');
        stableKeyService.createASObjectStableKey.mockReturnValue('object-stable-key');
    });

    describe('parseIcsToActivities', () => {
        it('produces a single Event activity for a minimal VEVENT', () => {
            const activities = module.parseIcsToActivities(MINIMAL_ICS, FAKE_GENERATOR, FAKE_ACTOR_ID);

            expect(activities).toHaveLength(1);
            const event = activities[0] as unknown as EventActivity;
            expect(event['@type']).toBe('Event');
            expect(event.summary).toBe('Hair Appointment');
            expect(event.actor).toEqual({ '@id': FAKE_ACTOR_ID, '@type': 'Person' });
            expect(event.generator).toBe(FAKE_GENERATOR);
            expect(event.attendees).toBeUndefined();
            expect(event.location).toBeUndefined();
        });

        it('builds a Place from LOCATION text and emits attendees', () => {
            const activities = module.parseIcsToActivities(
                ICS_WITH_LOCATION_AND_ATTENDEES,
                FAKE_GENERATOR,
                FAKE_ACTOR_ID,
            );

            const event = activities[0] as unknown as EventActivity & { location: Place };

            expect(event.summary).toBe('Weekly Standup');
            expect(event.location).toMatchObject({
                '@type': 'Place',
                name: 'Conference Room A',
                stableKeys: ['object-stable-key'],
            });
            expect(event.attendees).toEqual([
                {
                    email: 'alice@example.com',
                    name: 'Alice Johnson',
                    status: 'ACCEPTED',
                    role: 'REQ-PARTICIPANT',
                    type: 'INDIVIDUAL',
                },
                {
                    email: 'bob@example.com',
                    name: 'Bob Smith',
                    status: 'NEEDS-ACTION',
                    role: 'REQ-PARTICIPANT',
                    type: 'INDIVIDUAL',
                },
                { email: 'carol@example.com', status: 'DECLINED', role: 'REQ-PARTICIPANT', type: 'INDIVIDUAL' },
            ]);
            expect((event as unknown as IcsEventActivityInterface).organizer).toEqual({
                email: 'alice@example.com',
                name: 'alice',
            });
        });

        it('uses ics:<UID> as the first stable key for UID-based dedup', () => {
            const activities = module.parseIcsToActivities(MINIMAL_ICS, FAKE_GENERATOR, FAKE_ACTOR_ID);

            const event = activities[0] as unknown as EventActivity;

            expect(event.stableKeys).toEqual(['ics:minimal-event-1@test', 'activity-stable-key']);
        });

        it('keeps VEVENTs without a SUMMARY under a placeholder title', () => {
            const activities = module.parseIcsToActivities(ICS_WITH_INVALID_VEVENT, FAKE_GENERATOR, FAKE_ACTOR_ID);

            expect(activities.map((a) => (a as unknown as EventActivity).summary)).toEqual([
                'Untitled event',
                'Valid Event',
            ]);
        });

        it('expands recurring series with EXDATE, moved and cancelled instances', () => {
            const activities = module.parseIcsToActivities(ICS_WITH_RECURRING_SERIES, FAKE_GENERATOR, FAKE_ACTOR_ID, {
                now: NOW,
            }) as unknown as (EventActivity & IcsEventActivityInterface)[];

            expect(
                activities.map((a) => [a.summary, a.startTime!.toUTC().toISO(), a.endTime!.toUTC().toISO()]),
            ).toEqual([
                ['Dance class', '2025-03-03T18:00:00.000Z', '2025-03-03T19:30:00.000Z'],
                ['Dance class (moved)', '2025-03-18T17:00:00.000Z', '2025-03-18T18:30:00.000Z'],
                // After the DST switch the wall time stays 19:00 local.
                ['Dance class', '2025-03-31T17:00:00.000Z', '2025-03-31T18:30:00.000Z'],
            ]);
            expect(activities.map((a) => a.stableKeys![0])).toEqual([
                'ics:series-1@test:20250303T180000Z',
                'ics:series-1@test:20250317T180000Z',
                'ics:series-1@test:20250331T170000Z',
            ]);
            expect(activities.every((a) => a.isRecurring && a.calendarName === 'Personal')).toBe(true);
        });

        it('includes cancelled instances on request', () => {
            const activities = module.parseIcsToActivities(ICS_WITH_RECURRING_SERIES, FAKE_GENERATOR, FAKE_ACTOR_ID, {
                now: NOW,
                includeCancelled: true,
            }) as unknown as (EventActivity & IcsEventActivityInterface)[];

            expect(activities).toHaveLength(4);
            expect(activities.find((a) => a.status === 'CANCELLED')?.icsRecurrenceKey).toBe('20250324T180000Z');
        });

        it('stops expanding at the recurrence horizon', () => {
            const activities = module.parseIcsToActivities(ICS_WITH_RECURRING_SERIES, FAKE_GENERATOR, FAKE_ACTOR_ID, {
                now: DateTime.fromISO('2025-03-01T00:00:00Z'),
                recurrenceHorizon: 'P10D',
            });

            expect(activities).toHaveLength(1);
        });

        it('resolves Windows zones and keeps vendor extensions', () => {
            const [event] = module.parseIcsToActivities(
                ICS_OUTLOOK_WITH_EXTENSIONS,
                FAKE_GENERATOR,
                FAKE_ACTOR_ID,
            ) as unknown as (EventActivity & IcsEventActivityInterface)[];

            expect(event.startTime!.toUTC().toISO()).toBe('2025-07-15T08:00:00.000Z');
            expect(event.categories).toEqual(['Work', 'Important']);
            expect(event.conferenceUrl).toBe('https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc/0');
            expect(event.organizer).toEqual({ email: 'jane.doe@example.com', name: 'Doe, Jane' });
            expect(event.ics.vendor).toMatchObject({
                htmlDescription: '<html><body>Join</body></html>',
                microsoftBusyStatus: 'TENTATIVE',
                microsoftAllDayEvent: false,
            });
            expect(event.ics.alarms).toEqual([
                expect.objectContaining({ action: 'DISPLAY', triggerRelative: '-PT15M', triggerRelatedTo: 'START' }),
            ]);
            expect(event.ics.attachments[0]).toMatchObject({
                uri: 'https://example.com/agenda.pdf',
                filename: 'agenda.pdf',
            });
            expect(event.ics.attendees[0]).toMatchObject({ rsvp: true, extraParameters: { 'x-num-guests': '0' } });
            expect(event.ics.extraProperties.map((p) => p[0])).toEqual(
                expect.arrayContaining(['summary', 'x-unknown-vendor', 'x-microsoft-cdo-busystatus']),
            );
        });

        it('builds a geo Place from an Apple structured location', () => {
            const [event] = module.parseIcsToActivities(
                ICS_APPLE_STRUCTURED_LOCATION,
                FAKE_GENERATOR,
                FAKE_ACTOR_ID,
                { floatingZone: 'Europe/Berlin' },
            ) as unknown as (EventActivity & IcsEventActivityInterface & { location: Place })[];

            expect(event.location).toMatchObject({
                name: 'Porta Nigra\nPorta-Nigra-Platz, 54290 Trier',
                latitude: 49.759722,
                longitude: 6.644167,
            });
            expect(event.startTime!.toUTC().toISO()).toBe('2025-08-01T10:00:00.000Z');
            expect(event.endTime!.toUTC().toISO()).toBe('2025-08-01T12:00:00.000Z');
        });
    });

    describe('executeModule', () => {
        it('reads the asset, parses the ICS, and returns activities', async () => {
            const em = {} as EntityManager;
            const icsFile = { id: 'asset-1' } as never;

            assetService.getAssetString.mockResolvedValue(MINIMAL_ICS);

            const { activities } = await module.executeModule({
                em,
                inputData: { icsFile },
                progress: NOOP_MODULE_PROGRESS_REPORTER,
                dryRun: false,
            } as never);

            expect(assetService.getAssetString).toHaveBeenCalledWith(em, icsFile);
            expect(graphNodeService.getExtension).toHaveBeenCalledTimes(1);
            expect(graphService.getOwnerActor).toHaveBeenCalledWith(em);
            expect(activities).toHaveLength(1);
            expect((activities[0] as unknown as EventActivity).summary).toBe('Hair Appointment');
        });
    });
});
