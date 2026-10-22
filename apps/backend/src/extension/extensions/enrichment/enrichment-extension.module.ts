import { Module, type Type } from '@nestjs/common';
import { ActivityGraphModule } from '../../../activity-graph/activity-graph.module.js';
import { GraphDatabaseModule } from '../../../activity-graph/graph-database/graph-database.module.js';
import type { IPipelineModule } from '../../../etl/pipeline/pipeline-module/type/pipeline-module.interface.js';
import { ActivityInputReaderService } from './graph/activity-input-reader.service.js';
import { DerivedGraphService } from './graph/derived-graph.service.js';
import { ConfirmEventsPipelineModule } from './pipeline-module/confirm-events.pipeline-module.js';
import { ConsolidatePlacesPipelineModule } from './pipeline-module/consolidate-places.pipeline-module.js';
import { DailySummaryPipelineModule } from './pipeline-module/daily-summary.pipeline-module.js';
import { DeriveHomeWorkPipelineModule } from './pipeline-module/derive-home-work.pipeline-module.js';
import { DeriveTripsPipelineModule } from './pipeline-module/derive-trips.pipeline-module.js';
import { LinkListensToMovesPipelineModule } from './pipeline-module/link-listens-to-moves.pipeline-module.js';
import { GeocodePlacesOfflinePipelineModule } from './pipeline-module/geocode-places-offline.pipeline-module.js';
import { RefinePlacesOnlinePipelineModule } from './pipeline-module/refine-places-online.pipeline-module.js';
import { PlaceGeocodeService } from './graph/place-geocode.service.js';
import { GeoNamesDataService } from './geocoding/geonames-data.service.js';
import { NominatimClientService } from './geocoding/nominatim-client.service.js';
import { MapboxClientService } from './geocoding/mapbox-client.service.js';
import { RefinePlacesMapboxPipelineModule } from './pipeline-module/refine-places-mapbox.pipeline-module.js';

const pipelineModules = [
    ConsolidatePlacesPipelineModule,
    GeocodePlacesOfflinePipelineModule,
    RefinePlacesOnlinePipelineModule,
    DeriveHomeWorkPipelineModule,
    DeriveTripsPipelineModule,
    LinkListensToMovesPipelineModule,
    ConfirmEventsPipelineModule,
    DailySummaryPipelineModule,
] satisfies Type<IPipelineModule<unknown, unknown>>[];

/**
 * Modules that derive data from the graph (canonical places and their geocoding, home/work periods, trips, music on
 * the move, confirmed events, daily summaries) instead of importing it.
 */
@Module({
    imports: [GraphDatabaseModule, ActivityGraphModule],
    providers: [
        DerivedGraphService,
        ActivityInputReaderService,
        PlaceGeocodeService,
        GeoNamesDataService,
        NominatimClientService,
        MapboxClientService,
        RefinePlacesMapboxPipelineModule,
        ...pipelineModules,
    ],
    exports: [DerivedGraphService],
})
export class EnrichmentExtensionModule {}
