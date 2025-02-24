import { Enum, Items, Optional, Required } from 'ts-decorator-json-schema-generator';
import type { AssetDto } from '../../../../etl/asset/dto/asset.dto.js';
import { GOOGLE_EXTENSION, GOOGLE_EXTENSION_ID } from '../../local-extension.constant.js';
import { PipelineModule } from '../../../../etl/pipeline/pipeline-module/decorator/pipeline-module.decorator.js';
import type {
    IPipelineModule,
    PipelineModuleExecutionContext,
} from '../../../../etl/pipeline/pipeline-module/type/pipeline-module.interface.js';
import { PipelineModuleJsonSchema } from '../../../../etl/pipeline/pipeline-module/decorator/pipeline-module-json-schema.decorator.js';
import { AssetService } from '../../../../etl/asset/asset.service.js';
import type {
    ActivitySegment,
    Location,
    PlaceVisit,
    SemanticLocationHistory,
} from '@bytebunker/event-schema/extension/google';
import { PlaceConfidenceEnum } from '@bytebunker/event-schema/extension/google';
import type { Arrive, ASObject, Move, Place } from '@bytebunker/event-schema';
import { createUnknownASType } from '@bytebunker/event-schema';
import { Logger } from '@nestjs/common';
import { DateTime } from 'luxon';
import type { GooglePlaceObjectInterface } from '../type/google-place-object.interface.js';
import type { GoogleTimelineActivityInterface } from '../type/google-timeline-activity.interface.js';
import { hasOwn } from '../../../../util/util.js';
import { ActivityStableKeyService } from '../../../../activity-graph/activity-stable-key.service.js';
import { ActivityDto } from '../../../../activity-graph/dto/activity.dto.js';
import { ActivityGraphService } from '../../../../activity-graph/activity-graph.service.js';
import { ActivityGraphNodeService } from '../../../../activity-graph/activity-graph-node.service.js';

@PipelineModuleJsonSchema()
export class TransformSemanticLocationHistoryInput {
    @Required()
    public rawJson!: AssetDto;

    @Optional()
    @Enum(PlaceConfidenceEnum)
    public minPlaceConfidence?: PlaceConfidenceEnum;
}

@PipelineModuleJsonSchema()
export class TransformSemanticLocationHistoryOutput {
    @Required()
    @Items(ActivityDto)
    public activities!: ActivityDto[];
}

@PipelineModule({
    extensionName: GOOGLE_EXTENSION,
    inputType: TransformSemanticLocationHistoryInput,
    outputType: TransformSemanticLocationHistoryOutput,
})
export class TransformSemanticLocationHistoryPipelineModule
    implements IPipelineModule<TransformSemanticLocationHistoryInput, TransformSemanticLocationHistoryOutput>
{
    private readonly logger = new Logger(TransformSemanticLocationHistoryPipelineModule.name);

    constructor(
        private readonly assetService: AssetService,
        private readonly activityStableKeyService: ActivityStableKeyService,
        private readonly activityGraphService: ActivityGraphService,
        private readonly activityGraphNodeService: ActivityGraphNodeService,
    ) {}

    public async executeModule({
        em,
        inputData,
    }: PipelineModuleExecutionContext<TransformSemanticLocationHistoryInput>): Promise<TransformSemanticLocationHistoryOutput> {
        const { rawJson: rawJsonAsset, minPlaceConfidence = PlaceConfidenceEnum.MEDIUM_CONFIDENCE } = inputData;

        const generatorExtensionObject = await this.activityGraphNodeService.getExtension(em, GOOGLE_EXTENSION_ID);

        const rawJson = await this.assetService.getAssetString(em, rawJsonAsset);
        const rawLocations = JSON.parse(rawJson) as SemanticLocationHistory;

        const ownerActor = await this.activityGraphService.getOwnerActor(em);

        return {
            activities: rawLocations.timelineObjects
                .map((timelineObject) => {
                    if (hasOwn(timelineObject, 'activitySegment')) {
                        return this.transformActivitySegment(
                            generatorExtensionObject,
                            timelineObject.activitySegment as ActivitySegment,
                            ownerActor.get('id')!,
                        );
                    } else if (hasOwn(timelineObject, 'placeVisit')) {
                        return this.transformPlaceVisit({
                            generatorExtensionObject,
                            visit: timelineObject.placeVisit as PlaceVisit,
                            actorId: ownerActor.get('id')!,
                            minPlaceConfidence,
                        });
                    } else {
                        this.logger.warn('Unknown timeline object type', timelineObject);

                        return;
                    }
                })
                .filter(Boolean) as ActivityDto[],
        };
    }

    private transformActivitySegment(
        generatorExtensionObject: ASObject,
        activity: ActivitySegment,
        actorId: string,
    ): (Move & GoogleTimelineActivityInterface) | undefined {
        const startLocation = this.parseLocation(activity.startLocation, {
            usePlaceDetails: false,
            usePlaceLocation: true,
        });

        const endLocation = this.parseLocation(activity.endLocation, {
            usePlaceDetails: false,
            usePlaceLocation: true,
        });

        const startDateTime =
            this.parseDateTime(activity.duration?.startTimestamp) ??
            this.parseDateTime(activity.duration?.startTimestampMs);
        const endDateTime =
            this.parseDateTime(activity.duration?.endTimestamp) ??
            this.parseDateTime(activity.duration?.endTimestampMs);

        if (!startLocation || !endLocation || !startDateTime) {
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
            origin: startLocation,
            target: endLocation,
            startTime: startDateTime,
            endTime: endDateTime,
            activityType: activity.activityType,
            waypointPath: activity.waypointPath,
            simplifiedRawPath: activity.simplifiedRawPath,
        } satisfies Move & GoogleTimelineActivityInterface;
    }

    private parseDateTime(timestamp: string | undefined): DateTime<true> | undefined {
        if (!timestamp) {
            return undefined;
        }

        const dateTimeFromIso = DateTime.fromISO(timestamp);
        const dateTimeFromMillis = DateTime.fromMillis(Number(timestamp));

        return dateTimeFromIso.isValid ? dateTimeFromIso : dateTimeFromMillis.isValid ? dateTimeFromMillis : undefined;
    }

    private transformPlaceVisit({
        generatorExtensionObject,
        visit,
        actorId,
        minPlaceConfidence,
    }: {
        generatorExtensionObject: ASObject;
        visit: PlaceVisit;
        actorId: string;
        minPlaceConfidence: PlaceConfidenceEnum;
    }): Arrive | undefined {
        const isPlaceConfident = Boolean(
            visit.placeConfidence && this.isPlaceConfidenceHigherOrEqual(visit.placeConfidence, minPlaceConfidence),
        );
        const place = this.parseLocation(visit.location, {
            usePlaceDetails: isPlaceConfident,
            usePlaceLocation: isPlaceConfident,
            fallbackLatitude: visit.centerLatE7,
            fallbackLongitude: visit.centerLngE7,
        });

        const startDateTime =
            this.parseDateTime(visit.duration?.startTimestamp) ?? this.parseDateTime(visit.duration?.startTimestampMs);
        const endDateTime =
            this.parseDateTime(visit.duration?.endTimestamp) ?? this.parseDateTime(visit.duration?.endTimestampMs);

        if (!place || !startDateTime) {
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

    private parseLocation(
        location: Location | undefined,
        {
            usePlaceDetails = true,
            usePlaceLocation = true,
            fallbackLatitude,
            fallbackLongitude,
        }: {
            usePlaceDetails: boolean;
            usePlaceLocation: boolean;
            fallbackLatitude?: number;
            fallbackLongitude?: number;
        },
    ): Place | undefined {
        const rawLatitude = usePlaceLocation && location?.latitudeE7 ? location.latitudeE7 : fallbackLatitude;
        const rawLongitude = usePlaceLocation && location?.longitudeE7 ? location.longitudeE7 : fallbackLongitude;
        // Latitude/Longitude in "E7" format has to be divided by 10^7 for the expected range
        const latitude = rawLatitude ? rawLatitude / 10 ** 7 : undefined;
        const longitude = rawLongitude ? rawLongitude / 10 ** 7 : undefined;

        if (!rawLatitude || !rawLongitude) {
            return;
        }

        return {
            '@type': 'Place',
            '@secondaryTypes': [createUnknownASType('GooglePlace')],
            stableKeys: [
                this.activityStableKeyService.createASObjectStableKey('Place', {
                    lat: latitude,
                    lng: longitude,
                }),
                usePlaceDetails && location?.placeId
                    ? this.activityStableKeyService.createASObjectStableKey('Place', { placeId: location?.placeId })
                    : undefined,
            ].filter(Boolean),
            latitude,
            longitude,
            ...(usePlaceDetails
                ? {
                      name: location?.name,
                      placeId: location?.placeId,
                  }
                : {}),
        } satisfies Place & GooglePlaceObjectInterface;
    }

    private isPlaceConfidenceHigherOrEqual(
        confidence: PlaceConfidenceEnum,
        minConfidence: PlaceConfidenceEnum,
    ): boolean {
        switch (confidence) {
            case PlaceConfidenceEnum.LOW_CONFIDENCE:
                return minConfidence === PlaceConfidenceEnum.LOW_CONFIDENCE;
            case PlaceConfidenceEnum.MEDIUM_CONFIDENCE:
                return (
                    minConfidence === PlaceConfidenceEnum.LOW_CONFIDENCE ||
                    minConfidence === PlaceConfidenceEnum.MEDIUM_CONFIDENCE
                );
            case PlaceConfidenceEnum.HIGH_CONFIDENCE:
                return (
                    minConfidence === PlaceConfidenceEnum.LOW_CONFIDENCE ||
                    minConfidence === PlaceConfidenceEnum.MEDIUM_CONFIDENCE ||
                    minConfidence === PlaceConfidenceEnum.HIGH_CONFIDENCE
                );
            case PlaceConfidenceEnum.USER_CONFIRMED:
                return true;
        }
    }
}
