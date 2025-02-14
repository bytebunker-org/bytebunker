import { Enum, Items, Optional, Required } from 'ts-decorator-json-schema-generator';
import type { AssetDto } from '../../../../etl/asset/dto/asset.dto.js';
import { GOOGLE_EXTENSION, GOOGLE_EXTENSION_ID } from '../../local-extension.constant.js';
import { PipelineModule } from '../../../../etl/pipeline/pipeline-module/decorator/pipeline-module.decorator.js';
import type {
    IPipelineModule,
    PipelineModuleExecutionContext,
} from '../../../../etl/pipeline/pipeline-module/type/pipeline-module.interface.js';
import { PipelineModuleJsonSchema } from '../../../../etl/pipeline/pipeline-module/decorator/pipeline-module-json-schema.decorator.js';
import { ActivityDto } from '../../../../graph-database/dto/activity.dto.js';
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
import { EventService } from '../../../../event/event.service.js';
import { Logger } from '@nestjs/common';
import { DateTime } from 'luxon';
import type { GooglePlaceObjectInterface } from '../type/google-place-object.interface.js';
import type { GoogleTimelineActivityInterface } from '../type/google-timeline-activity.interface.js';
import { hasOwn } from '../../../../util/util.js';

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
        private readonly eventService: EventService,
    ) {}

    public async executeModule({
        em,
        inputData,
    }: PipelineModuleExecutionContext<TransformSemanticLocationHistoryInput>): Promise<TransformSemanticLocationHistoryOutput> {
        const { rawJson: rawJsonAsset, minPlaceConfidence = PlaceConfidenceEnum.HIGH_CONFIDENCE } = inputData;

        const rawJson = await this.assetService.getAssetString(em, rawJsonAsset);
        const rawLocations = JSON.parse(rawJson) as SemanticLocationHistory;

        const ownerActor = await this.eventService.getOwnerActor(em);

        return {
            activities: rawLocations.timelineObjects
                .map((timelineObject) => {
                    if (hasOwn(timelineObject, 'activitySegment')) {
                        return this.transformActivitySegment(
                            timelineObject.activitySegment as ActivitySegment,
                            ownerActor,
                        );
                    } else if (hasOwn(timelineObject, 'placeVisit')) {
                        return this.transformPlaceVisit({
                            visit: timelineObject.placeVisit as PlaceVisit,
                            actor: ownerActor,
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
        activity: ActivitySegment,
        actor: ASObject,
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
            generator: this.eventService.getExtension(GOOGLE_EXTENSION_ID),
            actor,
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
        const dateTime = timestamp ? DateTime.fromMillis(Number.parseInt(timestamp)) : undefined;

        return dateTime?.isValid ? dateTime : undefined;
    }

    private transformPlaceVisit({
        visit,
        actor,
        minPlaceConfidence,
    }: {
        visit: PlaceVisit;
        actor: ASObject;
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
            generator: this.eventService.getExtension(GOOGLE_EXTENSION_ID),
            stableKeys: [
                this.eventService.createActivityStableKey(
                    'Arrive',
                    {
                        start: startDateTime,
                    },
                    { dateTimePrecision: 'minute' },
                ),
            ],
            actor,
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
        const latitude = rawLatitude ? rawLatitude / 10 ** 7 : undefined;
        const longitude = rawLongitude ? rawLongitude / 10 ** 7 : undefined;

        if (!rawLatitude || !rawLongitude) {
            return;
        }

        return {
            '@type': 'Place',
            '@secondaryTypes': [createUnknownASType('GooglePlace')],
            stableKeys: [
                this.eventService.createASObjectStableKey('Place', {
                    lat: latitude,
                    lng: longitude,
                }),
                usePlaceDetails && location?.placeId
                    ? this.eventService.createASObjectStableKey('Place', { placeId: location?.placeId })
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
