import { Items, Required } from 'ts-decorator-json-schema-generator';
import { Logger } from '@nestjs/common';
import type { Add, ASObject, Create, Note, Place } from '@bytebunker/event-schema';
import { createUnknownASType } from '@bytebunker/event-schema';
import { AssetDto } from '../../../../etl/asset/dto/asset.dto.js';
import { AssetService } from '../../../../etl/asset/asset.service.js';
import { PipelineModule } from '../../../../etl/pipeline/pipeline-module/decorator/pipeline-module.decorator.js';
import { PipelineModuleJsonSchema } from '../../../../etl/pipeline/pipeline-module/decorator/pipeline-module-json-schema.decorator.js';
import type {
    IPipelineModule,
    PipelineModuleExecutionContext,
} from '../../../../etl/pipeline/pipeline-module/type/pipeline-module.interface.js';
import type { FileDetection, FileSample } from '../../../../etl/import/type/file-detection.interface.js';
import { ActivityDto } from '../../../../activity-graph/dto/activity.dto.js';
import { ActivityStableKeyService } from '../../../../activity-graph/activity-stable-key.service.js';
import { ActivityGraphService } from '../../../../activity-graph/activity-graph.service.js';
import { ActivityGraphNodeService } from '../../../../activity-graph/activity-graph-node.service.js';
import { GOOGLE_EXTENSION, GOOGLE_EXTENSION_ID } from '../../local-extension.constant.js';
import type { GoogleMapsPlaceObjectInterface } from '../type/google-maps-place-object.interface.js';
import {
    parseGoogleMapsPlaces,
    sniffGoogleMapsPlaces,
    type GoogleMapsPlaceEntry,
    type GoogleMapsPlacesKind,
} from '../util/google-maps-places.parser.js';

@PipelineModuleJsonSchema()
export class TransformMapsPlacesInput {
    @Required()
    public placesFile!: AssetDto;
}

@PipelineModuleJsonSchema()
export class TransformMapsPlacesOutput {
    @Required()
    @Items(ActivityDto)
    public activities!: ActivityDto[];
}

/**
 * Parses the Google Maps GeoJSON exports "Gespeicherte Orte" / "Saved Places" and "Bewertungen" / "Reviews".
 *
 * One module handles both files and picks the kind from the file name and the presence of a star rating:
 * - saved places become `Add` + `SavedPlace` (object: the place),
 * - reviews become `Create` + `Review` (object: a Note with the review text, target: the place, `rating`).
 *
 * "Meine Orte mit Beschriftungen" / "My labeled places" (Home, Work, ...) carry no dates and are not imported.
 */
@PipelineModule({
    extensionName: GOOGLE_EXTENSION,
    inputType: TransformMapsPlacesInput,
    outputType: TransformMapsPlacesOutput,
})
export class TransformMapsPlacesPipelineModule
    implements IPipelineModule<TransformMapsPlacesInput, TransformMapsPlacesOutput>
{
    private readonly logger = new Logger(TransformMapsPlacesPipelineModule.name);

    constructor(
        private readonly assetService: AssetService,
        private readonly activityStableKeyService: ActivityStableKeyService,
        private readonly activityGraphService: ActivityGraphService,
        private readonly activityGraphNodeService: ActivityGraphNodeService,
    ) {}

    public detectFile(sample: FileSample): FileDetection | undefined {
        if (sample.extension !== 'json') {
            return undefined;
        }

        const sniffed = sniffGoogleMapsPlaces(sample.fileName, sample.head);

        if (!sniffed) {
            return undefined;
        }

        return {
            confidence: sniffed.confidence,
            format: sniffed.kind === 'reviews' ? 'Google Maps reviews (Takeout)' : 'Google Maps saved places (Takeout)',
        };
    }

    public async executeModule({
        em,
        inputData,
        progress,
    }: PipelineModuleExecutionContext<TransformMapsPlacesInput>): Promise<TransformMapsPlacesOutput> {
        const { placesFile } = inputData;

        const generatorExtensionObject = await this.activityGraphNodeService.getExtension(em, GOOGLE_EXTENSION_ID);

        progress.message(`Reading ${placesFile.originalFilename ?? 'Maps places'}`);
        const raw = await this.assetService.getAssetString(em, placesFile);

        progress.message('Parsing places');
        const { kind, entries, skipped } = parseGoogleMapsPlaces(raw, kindFromFileName(placesFile.originalFilename));

        const ownerActor = await this.activityGraphService.getOwnerActor(em);
        const actorId = ownerActor.get('id')!;

        const activities: ActivityDto[] = [];

        for (const [index, entry] of entries.entries()) {
            if (index % 50 === 0) {
                progress.report({ current: index, total: entries.length, unit: 'places', message: 'Transforming' });
            }

            activities.push(
                kind === 'reviews'
                    ? this.buildReview(entry, generatorExtensionObject, actorId)
                    : this.buildSavedPlace(entry, generatorExtensionObject, actorId),
            );
        }

        this.logger.log(
            `Maps ${kind}: ${activities.length} activities from ${entries.length + skipped} features (${skipped} skipped without date or URL)`,
        );

        return { activities };
    }

    private buildSavedPlace(entry: GoogleMapsPlaceEntry, generator: ASObject, actorId: string): ActivityDto {
        return {
            '@type': 'Add',
            '@secondaryTypes': [createUnknownASType('SavedPlace')],
            generator,
            stableKeys: [`google-maps:saved:${identityOf(entry)}:${entry.date.toUTC().toISO()}`],
            actor: { '@id': actorId, '@type': 'Person' },
            object: this.buildPlace(entry),
            startTime: entry.date,
        } satisfies Add as ActivityDto;
    }

    private buildReview(entry: GoogleMapsPlaceEntry, generator: ASObject, actorId: string): ActivityDto {
        const identity = identityOf(entry);
        const note: Note | undefined = entry.reviewText
            ? {
                  '@type': 'Note',
                  stableKeys: [`google-maps:review-note:${identity}:${entry.date.toUTC().toISO()}`],
                  content: entry.reviewText,
              }
            : undefined;

        return {
            '@type': 'Create',
            '@secondaryTypes': [createUnknownASType('Review')],
            generator,
            stableKeys: [`google-maps:review:${identity}:${entry.date.toUTC().toISO()}`],
            actor: { '@id': actorId, '@type': 'Person' },
            ...(note ? { object: note } : {}),
            target: this.buildPlace(entry),
            ...(entry.rating === undefined ? {} : { rating: entry.rating }),
            startTime: entry.date,
        } satisfies Create as ActivityDto;
    }

    /**
     * Same Place keys as the timeline importer for coordinates (so places link up where Google reports the same
     * point), plus a cid key shared between the saved places and reviews exports.
     */
    private buildPlace(entry: GoogleMapsPlaceEntry): Place & GoogleMapsPlaceObjectInterface {
        const hasCoordinates = entry.latitude !== undefined && entry.longitude !== undefined;

        return {
            '@type': 'Place',
            '@secondaryTypes': [createUnknownASType('GooglePlace')],
            stableKeys: [
                entry.cid ? this.activityStableKeyService.createASObjectStableKey('Place', { cid: entry.cid }) : '',
                hasCoordinates
                    ? this.activityStableKeyService.createASObjectStableKey('Place', {
                          lat: entry.latitude,
                          lng: entry.longitude,
                      })
                    : '',
                !entry.cid && !hasCoordinates
                    ? this.activityStableKeyService.createASObjectStableKey('Place', { mapsUrl: entry.mapsUrl })
                    : '',
            ].filter(Boolean),
            ...(entry.name ? { name: entry.name } : {}),
            ...(entry.address ? { summary: entry.address, address: entry.address } : {}),
            ...(hasCoordinates ? { latitude: entry.latitude, longitude: entry.longitude } : {}),
            ...(entry.cid ? { cid: entry.cid } : {}),
            ...(entry.countryCode ? { countryCode: entry.countryCode } : {}),
            mapsUrl: entry.mapsUrl,
        };
    }
}

/** Identity used in the activity stable key: the cid when derivable, else the Maps URL. */
function identityOf(entry: GoogleMapsPlaceEntry): string {
    return entry.cid ?? entry.mapsUrl;
}

function kindFromFileName(fileName: string | undefined): GoogleMapsPlacesKind | undefined {
    if (fileName && /^(bewertungen|reviews)\.json$/i.test(fileName)) {
        return 'reviews';
    }

    if (fileName && /^(gespeicherte orte|saved places)\.json$/i.test(fileName)) {
        return 'saved';
    }

    return undefined;
}
