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

    public async executeModule({
        em,
        inputData,
    }: PipelineModuleExecutionContext<ParseIcsFileInput>): Promise<ParseIcsFileOutput> {
        const generatorExtensionObject = await this.activityGraphNodeService.getExtension(em, ICS_CALENDAR_EXTENSION_ID);
        const ownerActor = await this.activityGraphService.getOwnerActor(em);
        const actorId = ownerActor.get('id')!;

        const rawIcs = await this.assetService.getAssetString(em, inputData.icsFile);
        const activities = this.parseIcsToActivities(rawIcs, generatorExtensionObject, actorId);

        return { activities };
    }

    public parseIcsToActivities(
        rawIcs: string,
        generatorExtensionObject: ASObject,
        actorId: string,
    ): ActivityDto[] {
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
        const stableKeys = this.buildStableKeys(event.uid, startDateTime);

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

    private buildStableKeys(uid: string | undefined, startDateTime: DateTime<true>): string[] {
        return [
            uid ? `ics:${uid}` : undefined,
            this.activityStableKeyService.createActivityStableKey(
                'Event',
                { start: startDateTime },
                { dateTimePrecision: 'minute' },
            ),
        ].filter((key): key is string => Boolean(key));
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
