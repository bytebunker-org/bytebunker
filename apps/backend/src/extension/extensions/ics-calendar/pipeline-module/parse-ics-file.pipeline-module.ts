import { Items, Optional, Required } from 'ts-decorator-json-schema-generator';
import { Logger } from '@nestjs/common';
import { DateTime, Duration } from 'luxon';
import type { ASObject, EventActivity, Place } from '@bytebunker/event-schema';
import { createUnknownASType } from '@bytebunker/event-schema';
import type {
    IcsCalendarModel,
    IcsComponentModel,
    IcsOccurrenceModel,
    IcsParticipantModel,
} from '@bytebunker/event-schema/extension/ics';
import { AssetDto } from '../../../../etl/asset/dto/asset.dto.js';
import { ActivityDto } from '../../../../activity-graph/dto/activity.dto.js';
import { AssetService } from '../../../../etl/asset/asset.service.js';
import { ActivityStableKeyService } from '../../../../activity-graph/activity-stable-key.service.js';
import { ActivityGraphService } from '../../../../activity-graph/activity-graph.service.js';
import { ActivityGraphNodeService } from '../../../../activity-graph/activity-graph-node.service.js';
import { PipelineModule } from '../../../../etl/pipeline/pipeline-module/decorator/pipeline-module.decorator.js';
import { PipelineModuleJsonSchema } from '../../../../etl/pipeline/pipeline-module/decorator/pipeline-module-json-schema.decorator.js';
import type {
    IPipelineModule,
    PipelineModuleExecutionContext,
} from '../../../../etl/pipeline/pipeline-module/type/pipeline-module.interface.js';
import { ICS_CALENDAR_EXTENSION, ICS_CALENDAR_EXTENSION_ID } from '../../local-extension.constant.js';
import { parseIcsDocumentWithSources } from '../util/ics-document.parser.js';
import { expandIcsOccurrences } from '../util/ics-occurrence.util.js';
import type { IcsEventActivityInterface } from '../type/ics-event-activity.interface.js';
import type { FileDetection, FileSample } from '../../../../etl/import/type/file-detection.interface.js';

/** Zone for floating/all-day values when neither the value nor the calendar (X-WR-TIMEZONE) declares one. */
const DEFAULT_FLOATING_ZONE = 'Europe/Berlin';
const DEFAULT_RECURRENCE_HORIZON = 'P1Y';
const DEFAULT_MAX_OCCURRENCES_PER_SERIES = 5000;
const UNTITLED_EVENT_SUMMARY = 'Untitled event';

export interface ParseIcsOptions {
    floatingZone?: string;
    recurrenceHorizon?: string;
    maxOccurrencesPerSeries?: number;
    includeCancelled?: boolean;
    /** Reference "now" for the recurrence horizon (tests). */
    now?: DateTime;
}

@PipelineModuleJsonSchema()
export class ParseIcsFileInput {
    @Required()
    public icsFile!: AssetDto;

    /**
     * IANA zone for floating and all-day values when the calendar does not declare X-WR-TIMEZONE. Defaults to
     * Europe/Berlin.
     */
    @Optional()
    public floatingZone?: string;

    /**
     * How far past "now" recurring series are expanded, as ISO 8601 duration. Defaults to P1Y. Single events are
     * always imported regardless of their date.
     */
    @Optional()
    public recurrenceHorizon?: string;

    /** Safety cap of instances per recurring series. Defaults to 5000. */
    @Optional()
    public maxOccurrencesPerSeries?: number;

    /** Import events and instances with STATUS:CANCELLED too. Defaults to false. */
    @Optional()
    public includeCancelled?: boolean;
}

@PipelineModuleJsonSchema()
export class ParseIcsFileOutput {
    @Required()
    @Items(ActivityDto)
    public activities!: ActivityDto[];
}

/**
 * Parses any iCalendar file (Google, Outlook/Exchange, Apple, Thunderbird, my-hub, CalDAV dumps) into one Event
 * activity per occurrence. Recurring series are expanded with overrides and exceptions applied. Each activity
 * carries the full parsed component (`ics`), so properties without a dedicated field, vendor extensions included,
 * stay available.
 */
@PipelineModule({
    extensionName: ICS_CALENDAR_EXTENSION,
    inputType: ParseIcsFileInput,
    outputType: ParseIcsFileOutput,
})
export class ParseIcsFilePipelineModule implements IPipelineModule<ParseIcsFileInput, ParseIcsFileOutput> {
    private readonly logger = new Logger(ParseIcsFilePipelineModule.name);

    constructor(
        private readonly assetService: AssetService,
        private readonly activityStableKeyService: ActivityStableKeyService,
        private readonly activityGraphService: ActivityGraphService,
        private readonly activityGraphNodeService: ActivityGraphNodeService,
    ) {}

    public detectFile(sample: FileSample): FileDetection | undefined {
        if (/^\uFEFF?\s*begin:vcalendar/i.test(sample.head)) {
            return { confidence: 0.98, format: 'iCalendar (.ics)' };
        }

        return undefined;
    }

    public async executeModule({
        em,
        inputData,
        progress,
    }: PipelineModuleExecutionContext<ParseIcsFileInput>): Promise<ParseIcsFileOutput> {
        const generatorExtensionObject = await this.activityGraphNodeService.getExtension(
            em,
            ICS_CALENDAR_EXTENSION_ID,
        );
        const ownerActor = await this.activityGraphService.getOwnerActor(em);
        const actorId = ownerActor.get('id')!;

        progress.message('Reading calendar');
        const rawIcs = await this.assetService.getAssetString(em, inputData.icsFile);
        progress.message('Parsing events');
        const activities = this.parseIcsToActivities(rawIcs, generatorExtensionObject, actorId, inputData);

        return { activities };
    }

    public parseIcsToActivities(
        rawIcs: string,
        generatorExtensionObject: ASObject,
        actorId: string,
        options: ParseIcsOptions = {},
    ): ActivityDto[] {
        const horizon = Duration.fromISO(options.recurrenceHorizon ?? DEFAULT_RECURRENCE_HORIZON);
        const until = (options.now ?? DateTime.now()).plus(horizon.isValid ? horizon : { years: 1 });

        const { document, context, sources } = parseIcsDocumentWithSources(rawIcs, {
            floatingZone: options.floatingZone ?? DEFAULT_FLOATING_ZONE,
        });

        for (const warning of document.warnings) {
            this.logger.warn(`ICS import: ${warning.message}${warning.uid ? ` (uid=${warning.uid})` : ''}`);
        }

        const { occurrences, truncatedSeriesUids } = expandIcsOccurrences(sources, context, {
            until,
            maxOccurrencesPerSeries: options.maxOccurrencesPerSeries ?? DEFAULT_MAX_OCCURRENCES_PER_SERIES,
            includeCancelled: options.includeCancelled ?? false,
        });

        if (truncatedSeriesUids.length) {
            this.logger.warn(`Stopped expanding ${truncatedSeriesUids.length} series at the occurrence cap`);
        }

        this.logger.log(
            `Parsed ${document.components.length} iCalendar components into ${occurrences.length} event occurrences`,
        );

        return occurrences.map(
            (occurrence) =>
                this.transformOccurrence(
                    occurrence,
                    document.calendar,
                    generatorExtensionObject,
                    actorId,
                ) as unknown as ActivityDto,
        );
    }

    public transformOccurrence(
        occurrence: IcsOccurrenceModel,
        calendar: IcsCalendarModel,
        generatorExtensionObject: ASObject,
        actorId: string,
    ): EventActivity & IcsEventActivityInterface {
        const { component } = occurrence;
        const summary = component.summary?.trim() || UNTITLED_EVENT_SUMMARY;
        const startTime = DateTime.fromISO(occurrence.startIso, { setZone: true });
        const endTime = occurrence.endIso ? DateTime.fromISO(occurrence.endIso, { setZone: true }) : undefined;
        const location = this.buildLocationPlace(component);
        const attendees = component.attendees.map(toAttendee).filter((attendee) => attendee.email);
        const organizer = component.organizer ? toAttendee(component.organizer) : undefined;

        return {
            '@type': 'Event',
            '@secondaryTypes': [createUnknownASType('IcsEvent')],
            generator: generatorExtensionObject,
            stableKeys: this.buildStableKeys(occurrence, summary, startTime),
            actor: {
                '@id': actorId,
                '@type': 'Person',
            },
            summary,
            startTime,
            ...(endTime ? { endTime } : {}),
            allDay: occurrence.allDay,
            ...(component.description ? { content: component.description } : {}),
            ...(component.status ? { status: component.status } : {}),
            ...(component.url ? { eventUrl: component.url } : {}),
            ...(component.categories.length ? { categories: component.categories } : {}),
            ...(location ? { location } : {}),
            ...(attendees.length ? { attendees } : {}),
            ...(organizer?.email ? { organizer } : {}),
            ...(component.conferences.length ? { conferenceUrl: component.conferences[0].uri } : {}),
            ...(occurrence.uid ? { icsUid: occurrence.uid } : {}),
            ...(occurrence.recurrenceKey ? { icsRecurrenceKey: occurrence.recurrenceKey } : {}),
            isRecurring: occurrence.isRecurring,
            ...(calendar.name ? { calendarName: calendar.name } : {}),
            ics: component,
        } satisfies EventActivity & IcsEventActivityInterface;
    }

    /**
     * Identity is UID + recurrence instance only: the same event in another export (an old .ics backup, the my-hub
     * feed) dedupes, while different events that share a start time stay separate. Events without a UID (rare,
     * invalid per RFC 5545) fall back to a content key.
     */
    private buildStableKeys(occurrence: IcsOccurrenceModel, summary: string, startTime: DateTime): string[] {
        if (occurrence.uid) {
            return [
                occurrence.recurrenceKey
                    ? `ics:${occurrence.uid}:${occurrence.recurrenceKey}`
                    : `ics:${occurrence.uid}`,
            ];
        }

        return [
            this.activityStableKeyService.createActivityStableKey(
                'Event',
                { start: startTime, summary },
                { dateTimePrecision: 'minute' },
            ),
        ];
    }

    private buildLocationPlace(component: IcsComponentModel): Place | undefined {
        const structured = component.structuredLocations[0];
        const name = component.location?.trim() || structured?.name || structured?.address;
        const geo = component.geo ?? structured?.geo;

        if (!name && !geo) {
            return undefined;
        }

        return {
            '@type': 'Place',
            '@secondaryTypes': [createUnknownASType('IcsLocation')],
            stableKeys: [
                this.activityStableKeyService.createASObjectStableKey('Place', {
                    ...(name ? { name } : {}),
                    ...(geo ? { lat: geo.latitude, lng: geo.longitude } : {}),
                }),
            ],
            ...(name ? { name } : {}),
            ...(geo ? { latitude: geo.latitude, longitude: geo.longitude } : {}),
            ...(structured?.address && structured.address !== name ? { summary: structured.address } : {}),
        } satisfies Place;
    }
}

function toAttendee(participant: IcsParticipantModel): NonNullable<IcsEventActivityInterface['organizer']> {
    return {
        email: participant.email ?? participant.calAddress,
        ...(participant.name ? { name: participant.name } : {}),
        ...(participant.participationStatus ? { status: participant.participationStatus } : {}),
        ...(participant.participationRole ? { role: participant.participationRole } : {}),
        ...(participant.calendarUserType ? { type: participant.calendarUserType } : {}),
    };
}
