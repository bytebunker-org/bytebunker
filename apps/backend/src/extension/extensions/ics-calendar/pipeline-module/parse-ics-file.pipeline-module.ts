import { Items, Required } from 'ts-decorator-json-schema-generator';
import ICAL from 'ical.js';
import { Logger } from '@nestjs/common';
import type { DateTime } from 'luxon';
import type { ASObject, EventActivity, Place } from '@bytebunker/event-schema';
import { createUnknownASType } from '@bytebunker/event-schema';
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
import { icalTimeToLuxon, parseAttendees } from './parse-ics-file.util.js';
import type { FileDetection, FileSample } from '../../../../etl/import/type/file-detection.interface.js';

@PipelineModuleJsonSchema()
export class ParseIcsFileInput {
    @Required()
    public icsFile!: AssetDto;
}

@PipelineModuleJsonSchema()
export class ParseIcsFileOutput {
    @Required()
    @Items(ActivityDto)
    public activities!: ActivityDto[];
}

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
        if (/^\uFEFF?\s*BEGIN:VCALENDAR/i.test(sample.head)) {
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
        const activities = this.parseIcsToActivities(rawIcs, generatorExtensionObject, actorId);

        return { activities };
    }

    public parseIcsToActivities(rawIcs: string, generatorExtensionObject: ASObject, actorId: string): ActivityDto[] {
        const calendar = new ICAL.Component(ICAL.parse(rawIcs));
        const vevents = calendar.getAllSubcomponents('vevent');
        const activities: ActivityDto[] = [];

        for (const vevent of vevents) {
            const activity = this.transformEvent(vevent, generatorExtensionObject, actorId);

            if (activity) {
                activities.push(activity as unknown as ActivityDto);
            }
        }

        return activities;
    }

    public transformEvent(
        vevent: ICAL.Component,
        generatorExtensionObject: ASObject,
        actorId: string,
    ): EventActivity | undefined {
        const event = new ICAL.Event(vevent);

        const summary = event.summary?.trim();
        const startDateTime = icalTimeToLuxon(event.startDate);

        if (!summary || !startDateTime) {
            this.logger.warn(`Skipping VEVENT without summary or dtstart (uid=${event.uid ?? 'unknown'})`);
            return;
        }

        const endDateTime = icalTimeToLuxon(event.endDate);
        const locationText = event.location?.trim();
        const attendees = parseAttendees(event.attendees);
        const location = locationText ? this.buildLocationPlace(locationText) : undefined;
        const stableKeys = this.buildStableKeys(event, summary, startDateTime);

        return {
            '@type': 'Event',
            generator: generatorExtensionObject,
            stableKeys,
            actor: {
                '@id': actorId,
                '@type': 'Person',
            },
            summary,
            startTime: startDateTime,
            endTime: endDateTime,
            ...(location ? { location } : {}),
            ...(attendees.length ? { attendees } : {}),
        } satisfies EventActivity;
    }

    /**
     * One identity key per event, never the start time alone: any-key dedup would merge parallel events that start
     * together. A UID is shared by a recurring event and its edited occurrences, so RECURRENCE-ID tells those apart.
     */
    private buildStableKeys(event: ICAL.Event, summary: string, startDateTime: DateTime<true>): string[] {
        const uid = event.uid?.trim();

        if (!uid) {
            return [
                this.activityStableKeyService.createActivityStableKey(
                    'Event',
                    { start: startDateTime, summary },
                    { dateTimePrecision: 'minute' },
                ),
            ];
        }

        const recurrenceId = event.isRecurrenceException() ? icalTimeToLuxon(event.recurrenceId) : undefined;

        return [recurrenceId ? `ics:${uid}:${recurrenceId.toUTC().toISO()}` : `ics:${uid}`];
    }

    private buildLocationPlace(locationText: string): Place {
        return {
            '@type': 'Place',
            '@secondaryTypes': [createUnknownASType('IcsLocation')],
            stableKeys: [
                this.activityStableKeyService.createASObjectStableKey('Place', {
                    name: locationText,
                }),
            ],
            name: locationText,
        } satisfies Place;
    }
}
