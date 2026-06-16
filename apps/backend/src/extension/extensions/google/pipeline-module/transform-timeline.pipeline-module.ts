import { Items, Optional, Required } from 'ts-decorator-json-schema-generator';
import type { AssetDto } from '../../../../etl/asset/dto/asset.dto.js';
import { GOOGLE_EXTENSION, GOOGLE_EXTENSION_ID } from '../../local-extension.constant.js';
import { PipelineModule } from '../../../../etl/pipeline/pipeline-module/decorator/pipeline-module.decorator.js';
import type {
    IPipelineModule,
    PipelineModuleExecutionContext,
} from '../../../../etl/pipeline/pipeline-module/type/pipeline-module.interface.js';
import { PipelineModuleJsonSchema } from '../../../../etl/pipeline/pipeline-module/decorator/pipeline-module-json-schema.decorator.js';
import { AssetService } from '../../../../etl/asset/asset.service.js';
import type { Activity, LocationHistoryTimeline, SemanticSegment, Visit } from '@bytebunker/event-schema/extension/google';
import { ActivityTypeEnum } from '@bytebunker/event-schema/extension/google';
import type { Arrive, ASObject, Move, Place } from '@bytebunker/event-schema';
import { createUnknownASType } from '@bytebunker/event-schema';
import { Logger } from '@nestjs/common';
import { DateTime } from 'luxon';
import type { GooglePlaceObjectInterface } from '../type/google-place-object.interface.js';
import type { GoogleTimelineActivityInterface } from '../type/google-timeline-activity.interface.js';
import { ActivityStableKeyService } from '../../../../activity-graph/activity-stable-key.service.js';
import { ActivityDto } from '../../../../activity-graph/dto/activity.dto.js';
import { ActivityGraphService } from '../../../../activity-graph/activity-graph.service.js';
import { ActivityGraphNodeService } from '../../../../activity-graph/activity-graph-node.service.js';
import { NodeLabelEnum } from '../../../../activity-graph/node-label.enum.js';

@PipelineModuleJsonSchema()
export class TransformTimelineInput {
    @Required()
    public rawJson!: AssetDto;

    /**
     * Drop visit segments whose overall probability is below this threshold (0 to 1). Defaults to 0 (keep all).
     */
    @Optional()
    public minVisitProbability?: number;

    /**
     * When enabled, derive a cutoff from the newest already-stored Move/Arrive activity and only emit segments
     * starting at or after it. Lets a re-run import just the new tail of the timeline instead of the whole file
     * (the stableKey dedup still protects against the boundary segment). Defaults to false (emit everything).
     */
    @Optional()
    public skipAlreadyImported?: boolean;
}

@PipelineModuleJsonSchema()
export class TransformTimelineOutput {
    @Required()
    @Items(ActivityDto)
    public activities!: ActivityDto[];
}

/**
 * Parses the on-device Google Maps Timeline export (`Timeline.json`, semanticSegments format introduced in 2024) into
 * ActivityStreams activities. `visit` segments become `Arrive`, `activity` segments become `Move`. `timelinePath`-only
 * and `timelineMemory` segments are skipped for now.
 */
@PipelineModule({
    extensionName: GOOGLE_EXTENSION,
    inputType: TransformTimelineInput,
    outputType: TransformTimelineOutput,
})
export class TransformTimelinePipelineModule
    implements IPipelineModule<TransformTimelineInput, TransformTimelineOutput>
{
    private readonly logger = new Logger(TransformTimelinePipelineModule.name);

    constructor(
        private readonly assetService: AssetService,
        private readonly activityStableKeyService: ActivityStableKeyService,
        private readonly activityGraphService: ActivityGraphService,
        private readonly activityGraphNodeService: ActivityGraphNodeService,
    ) {}

    public async executeModule({
        em,
        inputData,
    }: PipelineModuleExecutionContext<TransformTimelineInput>): Promise<TransformTimelineOutput> {
        const { rawJson: rawJsonAsset, minVisitProbability = 0, skipAlreadyImported = false } = inputData;

        const generatorExtensionObject = await this.activityGraphNodeService.getExtension(em, GOOGLE_EXTENSION_ID);

        const rawJson = await this.assetService.getAssetString(em, rawJsonAsset);
        const timeline = JSON.parse(rawJson) as LocationHistoryTimeline;

        const ownerActor = await this.activityGraphService.getOwnerActor(em);
        const actorId = ownerActor.get('id')!;

        const importAfter = skipAlreadyImported
            ? await this.activityGraphService.getLatestActivityStartTime([
                  NodeLabelEnum.ACTIVITY_MOVE,
                  NodeLabelEnum.ACTIVITY_ARRIVE,
              ])
            : undefined;

        if (importAfter) {
            this.logger.log(`Skipping segments starting before the newest stored activity at ${importAfter.toISO()}`);
        }

        return {
            activities: (timeline.semanticSegments ?? [])
                .map((segment) => {
                    if (segment.visit) {
                        return this.transformVisit({
                            generatorExtensionObject,
                            segment,
                            visit: segment.visit,
                            actorId,
                            minVisitProbability,
                            importAfter,
                        });
                    } else if (segment.activity) {
                        return this.transformActivity({
                            generatorExtensionObject,
                            segment,
                            activity: segment.activity,
                            actorId,
                            importAfter,
                        });
                    } else if (segment.timelinePath || segment.timelineMemory) {
                        // Raw path / memory segments carry no discrete activity yet, skip silently.
                        return;
                    } else {
                        this.logger.warn('Unknown semantic segment type', segment);

                        return;
                    }
                })
                .filter(Boolean) as ActivityDto[],
        };
    }

    private transformActivity({
        generatorExtensionObject,
        segment,
        activity,
        actorId,
        importAfter,
    }: {
        generatorExtensionObject: ASObject;
        segment: SemanticSegment;
        activity: Activity;
        actorId: string;
        importAfter: DateTime | undefined;
    }): (Move & GoogleTimelineActivityInterface) | undefined {
        const origin = this.parsePlace(activity.start?.latLng);
        const target = this.parsePlace(activity.end?.latLng);

        const startDateTime = this.parseDateTime(segment.startTime);
        const endDateTime = this.parseDateTime(segment.endTime);

        if (!origin || !target || !startDateTime) {
            return;
        }

        if (importAfter && startDateTime < importAfter) {
            return;
        }

        return {
            '@type': 'Move',
            '@secondaryTypes': [createUnknownASType('GoogleTimelineActivity')],
            generator: generatorExtensionObject,
            stableKeys: [
                this.activityStableKeyService.createActivityStableKey(
                    'Move',
                    {
                        start: startDateTime,
                    },
                    { dateTimePrecision: 'minute' },
                ),
            ],
            actor: {
                '@id': actorId,
                '@type': 'Person',
            },
            origin,
            target,
            startTime: startDateTime,
            endTime: endDateTime,
            activityType: activity.topCandidate?.type as ActivityTypeEnum | undefined,
        } satisfies Move & GoogleTimelineActivityInterface;
    }

    private transformVisit({
        generatorExtensionObject,
        segment,
        visit,
        actorId,
        minVisitProbability,
        importAfter,
    }: {
        generatorExtensionObject: ASObject;
        segment: SemanticSegment;
        visit: Visit;
        actorId: string;
        minVisitProbability: number;
        importAfter: DateTime | undefined;
    }): Arrive | undefined {
        if (visit.probability !== undefined && visit.probability < minVisitProbability) {
            return;
        }

        const place = this.parsePlace(visit.topCandidate?.placeLocation?.latLng, visit.topCandidate?.placeId);

        const startDateTime = this.parseDateTime(segment.startTime);
        const endDateTime = this.parseDateTime(segment.endTime);

        if (!place || !startDateTime) {
            return;
        }

        if (importAfter && startDateTime < importAfter) {
            return;
        }

        return {
            '@type': 'Arrive',
            generator: generatorExtensionObject,
            stableKeys: [
                this.activityStableKeyService.createActivityStableKey(
                    'Arrive',
                    {
                        start: startDateTime,
                    },
                    { dateTimePrecision: 'minute' },
                ),
            ],
            actor: {
                '@id': actorId,
                '@type': 'Person',
            },
            location: place,
            startTime: startDateTime,
            endTime: endDateTime,
        } satisfies Arrive;
    }

    private parsePlace(latLng: string | undefined, placeId?: string): (Place & GooglePlaceObjectInterface) | undefined {
        const coordinates = this.parseGeoString(latLng);

        if (!coordinates) {
            return;
        }

        const { latitude, longitude } = coordinates;

        return {
            '@type': 'Place',
            '@secondaryTypes': [createUnknownASType('GooglePlace')],
            stableKeys: [
                this.activityStableKeyService.createASObjectStableKey('Place', {
                    lat: latitude,
                    lng: longitude,
                }),
                placeId
                    ? this.activityStableKeyService.createASObjectStableKey('Place', { placeId })
                    : undefined,
            ].filter(Boolean),
            latitude,
            longitude,
            ...(placeId ? { placeId } : {}),
        } satisfies Place & GooglePlaceObjectInterface;
    }

    /**
     * Parses a Google Timeline coordinate string such as `"49.7403348°, 6.650313°"` into latitude/longitude numbers.
     */
    private parseGeoString(value: string | undefined): { latitude: number; longitude: number } | undefined {
        if (!value) {
            return undefined;
        }

        const parts = value.split(',');

        if (parts.length !== 2) {
            return undefined;
        }

        const latitude = Number.parseFloat(parts[0]!.replace('°', '').trim());
        const longitude = Number.parseFloat(parts[1]!.replace('°', '').trim());

        if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
            return undefined;
        }

        return { latitude, longitude };
    }

    private parseDateTime(timestamp: string | undefined): DateTime<true> | undefined {
        if (!timestamp) {
            return undefined;
        }

        const dateTime = DateTime.fromISO(timestamp);

        return dateTime.isValid ? dateTime : undefined;
    }
}
