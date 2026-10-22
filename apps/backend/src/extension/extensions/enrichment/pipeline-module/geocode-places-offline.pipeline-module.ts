import { Optional, Required, Type } from 'ts-decorator-json-schema-generator';
import { PipelineModule } from '../../../../etl/pipeline/pipeline-module/decorator/pipeline-module.decorator.js';
import { PipelineModuleJsonSchema } from '../../../../etl/pipeline/pipeline-module/decorator/pipeline-module-json-schema.decorator.js';
import type {
    IPipelineModule,
    PipelineModuleExecutionContext,
} from '../../../../etl/pipeline/pipeline-module/type/pipeline-module.interface.js';
import { ENRICHMENT_EXTENSION } from '../../local-extension.constant.js';
import { GEONAMES_ATTRIBUTION } from '../geocoding/geocoding.constant.js';
import { GeoNamesDataService } from '../geocoding/geonames-data.service.js';
import { PlaceGeocodeService, type PlacePropertyUpdate } from '../graph/place-geocode.service.js';
import { reverseGeocodeOffline } from '../util/geonames.util.js';
import { formatCount, positiveOr } from '../util/module-input.util.js';
import { buildOfflineGeocodeProps } from '../util/place-geocoding.util.js';

const DEFAULTS = {
    maxCityDistanceKm: 100,
    metroRadiusKm: 25,
    metroMinPopulation: 100_000,
};
const REPORTED_ENTRIES = 15;

@PipelineModuleJsonSchema()
export class GeocodePlacesOfflineInput {
    /** Places farther than this (km) from any GeoNames place get no city/country. Default 100. */
    @Optional()
    @Type('number')
    public maxCityDistanceKm?: number;

    /** Radius (km) for metroCity, the big city nearby used for trip names. Default 25. */
    @Optional()
    @Type('number')
    public metroRadiusKm?: number;

    /** Minimum population of a metroCity. Default 100000. */
    @Optional()
    @Type('number')
    public metroMinPopulation?: number;

    /** Copy each place's timezone onto its arrives and departing moves as `localTimezone`. Default true. */
    @Optional()
    @Type('boolean')
    public setActivityTimezones?: boolean;
}

export interface CountEntry {
    name: string;
    places: number;
}

export interface GeocodePlacesOfflineSummary {
    dryRun: boolean;
    options: typeof DEFAULTS & { setActivityTimezones: boolean };
    placeCount: number;
    geocoded: number;
    /** Places too far from any GeoNames place. */
    notGeocoded: number;
    /** Places whose name changed (OSM name, address) compared with what the node had. */
    renamed: number;
    countries: CountEntry[];
    topCities: CountEntry[];
    timezones: CountEntry[];
    /** Activities whose `localTimezone` changed; null on a dry run or when disabled. */
    activitiesWithTimezone: number | null;
    geonames: { dataDir: string; downloaded: string[]; cityCount: number; loadMs: number };
    durationMs: number;
    attribution: string;
}

@PipelineModuleJsonSchema()
export class GeocodePlacesOfflineOutput {
    @Required()
    @Type('integer')
    public geocodedPlaceCount!: number;

    /** Counts per country, city and timezone, GeoNames data used. */
    @Required()
    @Type('object')
    public summary!: GeocodePlacesOfflineSummary;
}

/**
 * Offline reverse geocoding of every canonical place from GeoNames (cities1000, downloaded on first use): nearest
 * city, state, country, IANA timezone and the distance to that city. Picks the best place name (OSM POI name from
 * enrichment:refine-places-online > source name > address). Merges into the nodes; re-runs are idempotent.
 */
@PipelineModule({
    extensionName: ENRICHMENT_EXTENSION,
    inputType: GeocodePlacesOfflineInput,
    outputType: GeocodePlacesOfflineOutput,
    progressWeight: 1,
    description:
        'Sets city, admin1, countryCode, country, timezone and cityDistanceKm on every CanonicalPlace from GeoNames ' +
        'cities1000 (offline, downloaded on first use), picks the best name, and copies the timezone onto arrives ' +
        'and moves as localTimezone. Run after consolidate-places.',
})
export class GeocodePlacesOfflinePipelineModule
    implements IPipelineModule<GeocodePlacesOfflineInput, GeocodePlacesOfflineOutput>
{
    constructor(
        private readonly geoNamesDataService: GeoNamesDataService,
        private readonly placeGeocodeService: PlaceGeocodeService,
    ) {}

    public async executeModule({
        inputData,
        progress,
        dryRun,
    }: PipelineModuleExecutionContext<GeocodePlacesOfflineInput>): Promise<GeocodePlacesOfflineOutput> {
        const started = Date.now();
        const options = {
            maxCityDistanceKm: positiveOr(inputData.maxCityDistanceKm, DEFAULTS.maxCityDistanceKm),
            metroRadiusKm: positiveOr(inputData.metroRadiusKm, DEFAULTS.metroRadiusKm),
            metroMinPopulation: positiveOr(inputData.metroMinPopulation, DEFAULTS.metroMinPopulation),
            setActivityTimezones: inputData.setActivityTimezones !== false,
        };

        progress.message('Loading GeoNames');
        const { lookups, info } = await this.geoNamesDataService.load((message) => progress.message(message));

        progress.message('Reading canonical places');
        const places = await this.placeGeocodeService.readPlaces();
        const now = new Date();
        const rows: PlacePropertyUpdate[] = [];
        const timezoneRows: { id: string; timezone: string }[] = [];
        const countries = new Map<string, number>();
        const cities = new Map<string, number>();
        const timezones = new Map<string, number>();
        let geocoded = 0;
        let renamed = 0;

        progress.report({ message: 'Geocoding places', current: 0, total: places.length, unit: 'places' });

        for (const place of places) {
            const geocode = reverseGeocodeOffline(lookups, place, options);
            const props = buildOfflineGeocodeProps(place, geocode, lookups.countries, now);
            rows.push({ id: place.id, props });

            if (geocode) {
                geocoded++;
            }

            if (typeof props['name'] === 'string' && props['name'] !== place.name) {
                renamed++;
            }

            increment(countries, props['country'] ?? props['countryCode']);
            increment(cities, props['city'] ? `${String(props['city'])} (${String(props['countryCode'])})` : undefined);
            increment(timezones, props['timezone']);

            if (typeof props['timezone'] === 'string') {
                timezoneRows.push({ id: place.id, timezone: props['timezone'] });
            }
        }

        let activitiesWithTimezone: number | null = null;

        if (!dryRun) {
            progress.report({ message: 'Writing places', current: 0, total: rows.length, unit: 'places' });
            await this.placeGeocodeService.updatePlaces(rows, (written) => progress.report({ current: written }));

            if (options.setActivityTimezones) {
                progress.report({
                    message: 'Copying timezones onto activities',
                    current: 0,
                    total: timezoneRows.length,
                    unit: 'places',
                });
                activitiesWithTimezone = await this.placeGeocodeService.copyTimezoneToActivities(
                    timezoneRows,
                    (processed) => progress.report({ current: processed }),
                );
            }
        }

        progress.message(
            `${dryRun ? 'Would geocode' : 'Geocoded'} ${formatCount(geocoded)} of ${formatCount(places.length)} places`,
        );

        return {
            geocodedPlaceCount: geocoded,
            summary: {
                dryRun,
                options,
                placeCount: places.length,
                geocoded,
                notGeocoded: places.length - geocoded,
                renamed,
                countries: top(countries, 50),
                topCities: top(cities, REPORTED_ENTRIES),
                timezones: top(timezones, REPORTED_ENTRIES),
                activitiesWithTimezone,
                geonames: info,
                durationMs: Date.now() - started,
                attribution: GEONAMES_ATTRIBUTION,
            },
        };
    }
}

function increment(counts: Map<string, number>, key: unknown): void {
    if (typeof key === 'string' && key) {
        counts.set(key, (counts.get(key) ?? 0) + 1);
    }
}

function top(counts: Map<string, number>, limit: number): CountEntry[] {
    return [...counts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, limit)
        .map(([name, places]) => ({ name, places }));
}
