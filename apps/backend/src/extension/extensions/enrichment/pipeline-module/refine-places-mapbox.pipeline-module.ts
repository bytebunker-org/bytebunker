import { Logger } from '@nestjs/common';
import type { EntityManager } from '@mikro-orm/postgresql';
import { Optional, Required, Type } from 'ts-decorator-json-schema-generator';
import { PipelineModule } from '../../../../etl/pipeline/pipeline-module/decorator/pipeline-module.decorator.js';
import { PipelineModuleJsonSchema } from '../../../../etl/pipeline/pipeline-module/decorator/pipeline-module-json-schema.decorator.js';
import type {
    IPipelineModule,
    PipelineModuleExecutionContext,
} from '../../../../etl/pipeline/pipeline-module/type/pipeline-module.interface.js';
import { PipelineExecutionEntity } from '../../../../etl/pipeline/entity/pipeline-execution.entity.js';
import { PipelineExecutionStatusEnum } from '../../../../etl/pipeline/type/pipeline-execution-status.enum.js';
import { ENRICHMENT_EXTENSION } from '../../local-extension.constant.js';
import { MapboxClientService } from '../geocoding/mapbox-client.service.js';
import { PlaceGeocodeService } from '../graph/place-geocode.service.js';
import { formatCount, positiveOr } from '../util/module-input.util.js';
import { selectPlacesForMapbox } from '../util/mapbox.util.js';
import { buildMapboxRefinementProps } from '../util/place-geocoding.util.js';

const DEFAULTS = {
    maxPlaces: 3000,
    movedMeters: 100,
    maxConsecutiveFailures: 5,
    language: 'de,en',
};
const ABORT_CHECK_INTERVAL = 25;
const REPORTED_PLACES = 15;

@PipelineModuleJsonSchema()
export class RefinePlacesMapboxInput {
    /** Places per run, most visited first (≈ 6 per second). Default 3000. */
    @Optional()
    @Type('integer')
    public maxPlaces?: number;

    /** Ask Mapbox again for places refined more than this many days ago. Default: never. */
    @Optional()
    @Type('number')
    public refreshDays?: number;

    /** Comma-separated languages for names (Mapbox `language`). Default "de,en". */
    @Optional()
    @Type('string')
    public language?: string;

    /** Ask again if consolidation moved the place more than this many meters. Default 100. */
    @Optional()
    @Type('number')
    public movedMeters?: number;

    /** Stop after this many places failed in a row (after retries). Default 5. */
    @Optional()
    @Type('integer')
    public maxConsecutiveFailures?: number;
}

export interface RefinePlacesMapboxSummary {
    dryRun: boolean;
    configured: boolean;
    placeCount: number;
    pendingBefore: number;
    refined: number;
    notFound: number;
    failures: number;
    failedPlaces: { id: string; error: string }[];
    remaining: number;
    stoppedReason: string | null;
    durationMs: number;
    sample: Record<string, unknown>[];
}

@PipelineModuleJsonSchema()
export class RefinePlacesMapboxOutput {
    @Required()
    @Type('integer')
    public refinedCount!: number;

    @Required()
    @Type('integer')
    public remaining!: number;

    @Required()
    @Type('object')
    public summary!: RefinePlacesMapboxSummary;
}

/**
 * Refines canonical places with Mapbox reverse geocoding (temporary Geocoding API): nearest POI name and category,
 * street address, postcode, neighbourhood, city. Results are stored on the place in `mapbox*` properties; naming
 * prefers an OSM POI name, then the Mapbox POI name. Does nothing without `geocoding.mapboxAccessToken`.
 */
@PipelineModule({
    extensionName: ENRICHMENT_EXTENSION,
    inputType: RefinePlacesMapboxInput,
    outputType: RefinePlacesMapboxOutput,
    progressWeight: 3,
    description:
        'Refines CanonicalPlaces via Mapbox reverse geocoding (POI name and category, address, postcode, city), most ' +
        'visited first. Needs geocoding.mapboxAccessToken; writes each place immediately.',
})
export class RefinePlacesMapboxPipelineModule
    implements IPipelineModule<RefinePlacesMapboxInput, RefinePlacesMapboxOutput>
{
    private readonly logger = new Logger(RefinePlacesMapboxPipelineModule.name);
    private running = false;

    constructor(
        private readonly mapbox: MapboxClientService,
        private readonly placeGeocodeService: PlaceGeocodeService,
    ) {}

    public async executeModule(
        context: PipelineModuleExecutionContext<RefinePlacesMapboxInput>,
    ): Promise<RefinePlacesMapboxOutput> {
        if (this.running) {
            return this.output(context.dryRun, { stoppedReason: 'Another Mapbox refinement run is in progress' });
        }

        this.running = true;

        try {
            return await this.refine(context);
        } finally {
            this.running = false;
        }
    }

    private async refine({
        em,
        inputData,
        pipelineExecution,
        progress,
        dryRun,
    }: PipelineModuleExecutionContext<RefinePlacesMapboxInput>): Promise<RefinePlacesMapboxOutput> {
        const started = Date.now();
        const client = this.mapbox.client;

        if (!client) {
            progress.message('No Mapbox access token configured (geocoding.mapboxAccessToken); nothing to do');

            return this.output(dryRun, { stoppedReason: 'No Mapbox access token configured', started });
        }

        const maxPlaces = Math.round(positiveOr(inputData.maxPlaces, DEFAULTS.maxPlaces));
        const maxConsecutiveFailures = Math.round(
            positiveOr(inputData.maxConsecutiveFailures, DEFAULTS.maxConsecutiveFailures),
        );
        const language = inputData.language?.trim() || DEFAULTS.language;

        progress.message('Reading canonical places');
        const places = await this.placeGeocodeService.readPlaces();
        const { selected, pending } = selectPlacesForMapbox(places, {
            now: new Date(),
            refreshDays:
                typeof inputData.refreshDays === 'number' && inputData.refreshDays > 0
                    ? inputData.refreshDays
                    : undefined,
            movedMeters: positiveOr(inputData.movedMeters, DEFAULTS.movedMeters),
            maxPlaces,
        });

        if (dryRun) {
            progress.message(`Would refine ${formatCount(selected.length)} of ${formatCount(pending)} due places`);

            return this.output(dryRun, {
                placeCount: places.length,
                pendingBefore: pending,
                remaining: pending,
                started,
            });
        }

        const sample: Record<string, unknown>[] = [];
        const failedPlaces: { id: string; error: string }[] = [];
        let refined = 0;
        let notFound = 0;
        let consecutiveFailures = 0;
        let stoppedReason: string | null = null;

        progress.report({ message: 'Refining places with Mapbox', current: 0, total: selected.length, unit: 'places' });

        for (const [index, place] of selected.entries()) {
            if (index > 0 && index % ABORT_CHECK_INTERVAL === 0 && (await this.isAborted(em, pipelineExecution.id))) {
                stoppedReason = 'Execution aborted';
                break;
            }

            const result = await client.reverse(place, language);

            if (!result.ok) {
                consecutiveFailures++;
                failedPlaces.push({ id: place.id, error: result.error });
                this.logger.warn(`Mapbox refinement of ${place.id} failed: ${result.error}`);

                if (consecutiveFailures >= maxConsecutiveFailures) {
                    stoppedReason = `${consecutiveFailures} places in a row failed (last: ${result.error})`;
                    break;
                }

                continue;
            }

            consecutiveFailures = 0;
            const props = buildMapboxRefinementProps(place, result.details, new Date());
            await this.placeGeocodeService.updatePlaces([{ id: place.id, props }]);

            if (result.details.mapboxFound) {
                refined++;
            } else {
                notFound++;
            }

            if (sample.length < REPORTED_PLACES) {
                sample.push({
                    id: place.id,
                    name: props['name'],
                    nameSource: props['nameSource'],
                    mapboxName: props['mapboxName'],
                    mapboxCategory: props['mapboxCategory'],
                    mapboxCity: props['mapboxCity'],
                });
            }

            progress.report({
                current: index + 1,
                message: `Refined ${typeof props['name'] === 'string' ? props['name'] : place.id}`,
            });
        }

        const remaining = pending - refined - notFound;
        progress.message(
            `Mapbox refined ${formatCount(refined + notFound)} place(s), ${formatCount(remaining)} remaining` +
                (stoppedReason ? ` (stopped: ${stoppedReason})` : ''),
        );

        return this.output(dryRun, {
            placeCount: places.length,
            pendingBefore: pending,
            refined,
            notFound,
            failedPlaces,
            remaining,
            stoppedReason,
            sample,
            started,
        });
    }

    private output(
        dryRun: boolean,
        values: Partial<Omit<RefinePlacesMapboxSummary, 'dryRun' | 'configured' | 'durationMs' | 'failures'>> & {
            started?: number;
        },
    ): RefinePlacesMapboxOutput {
        const refined = values.refined ?? 0;
        const notFound = values.notFound ?? 0;
        const failedPlaces = values.failedPlaces ?? [];

        return {
            refinedCount: refined + notFound,
            remaining: values.remaining ?? 0,
            summary: {
                dryRun,
                configured: Boolean(this.mapbox.client),
                placeCount: values.placeCount ?? 0,
                pendingBefore: values.pendingBefore ?? 0,
                refined,
                notFound,
                failures: failedPlaces.length,
                failedPlaces: failedPlaces.slice(0, REPORTED_PLACES),
                remaining: values.remaining ?? 0,
                stoppedReason: values.stoppedReason ?? null,
                durationMs: values.started === undefined ? 0 : Date.now() - values.started,
                sample: values.sample ?? [],
            },
        };
    }

    protected async isAborted(em: EntityManager, executionId: number): Promise<boolean> {
        try {
            const current = await em
                .fork()
                .findOne(PipelineExecutionEntity, { id: executionId }, { fields: ['executionStatus'] });

            return current?.executionStatus === PipelineExecutionStatusEnum.ABORTED;
        } catch {
            return false;
        }
    }
}
