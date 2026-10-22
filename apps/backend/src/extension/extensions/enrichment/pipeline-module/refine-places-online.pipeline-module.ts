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
import { DEFAULT_ACCEPT_LANGUAGE, OSM_ATTRIBUTION } from '../geocoding/geocoding.constant.js';
import { NominatimClientService } from '../geocoding/nominatim-client.service.js';
import { PlaceGeocodeService } from '../graph/place-geocode.service.js';
import { formatCount, positiveOr } from '../util/module-input.util.js';
import { buildRefinementProps, selectPlacesToRefine } from '../util/place-geocoding.util.js';

const DEFAULTS = {
    maxPlaces: 600,
    movedMeters: 100,
    maxConsecutiveFailures: 5,
};
/** Places between two checks whether the execution was aborted. */
const ABORT_CHECK_INTERVAL = 10;
const REPORTED_PLACES = 15;

@PipelineModuleJsonSchema()
export class RefinePlacesOnlineInput {
    /** Places refined per run, most visited first (≈ 1 per second). Default 600. */
    @Optional()
    @Type('integer')
    public maxPlaces?: number;

    /** Refine places again whose refinement is older than this many days. Default: never. */
    @Optional()
    @Type('number')
    public refreshDays?: number;

    /** Accept-Language for Nominatim (names, display name). Default "de,en". */
    @Optional()
    @Type('string')
    public acceptLanguage?: string;

    /** Refine a place again if consolidation moved it more than this many meters. Default 100. */
    @Optional()
    @Type('number')
    public movedMeters?: number;

    /** Stop the run after this many places failed in a row (after retries). Default 5. */
    @Optional()
    @Type('integer')
    public maxConsecutiveFailures?: number;
}

export interface RefinedPlaceEntry {
    id: string;
    name?: string;
    nameSource?: string;
    osmName?: string;
    road?: string;
    city?: string;
}

export interface RefinePlacesOnlineSummary {
    dryRun: boolean;
    options: typeof DEFAULTS & { refreshDays: number | null; acceptLanguage: string };
    nominatim: { baseUrl: string; minIntervalMs: number };
    placeCount: number;
    /** Places due for refinement when the run started. */
    pendingBefore: number;
    /** Places written with an OSM result. */
    refined: number;
    /** Places Nominatim had nothing for (marked refined, so they are not asked again). */
    notFound: number;
    failures: number;
    failedPlaces: { id: string; error: string }[];
    /** Places still due after this run. */
    remaining: number;
    /** Set when the run ended before maxPlaces: aborted, repeated failures, another run in progress. */
    stoppedReason: string | null;
    durationMs: number;
    sample: RefinedPlaceEntry[];
}

@PipelineModuleJsonSchema()
export class RefinePlacesOnlineOutput {
    @Required()
    @Type('integer')
    public refinedCount!: number;

    @Required()
    @Type('integer')
    public remaining!: number;

    /** Licence note for the stored OpenStreetMap data. */
    @Required()
    @Type('string')
    public attribution!: string;

    @Required()
    @Type('object')
    public summary!: RefinePlacesOnlineSummary;
}

/**
 * Refines canonical places with Nominatim reverse geocoding (OSM): POI name, road, house number, postcode, suburb,
 * city, OSM ids. Slow by design (at most one request per second against the public instance), so every place is
 * written as soon as its answer arrives: aborting or a crash loses nothing, and the next run continues with the
 * places still due. Meant to run often with a small maxPlaces until every place is refined.
 */
@PipelineModule({
    extensionName: ENRICHMENT_EXTENSION,
    inputType: RefinePlacesOnlineInput,
    outputType: RefinePlacesOnlineOutput,
    progressWeight: 3,
    description:
        'Refines CanonicalPlaces via Nominatim reverse geocoding (OSM POI name, road, house number, postcode, suburb, ' +
        'city), most visited first, at most maxPlaces per run at 1 request/second. Writes each place immediately, so ' +
        'runs can be aborted and resumed. Data © OpenStreetMap contributors, ODbL 1.0.',
})
export class RefinePlacesOnlinePipelineModule
    implements IPipelineModule<RefinePlacesOnlineInput, RefinePlacesOnlineOutput>
{
    private readonly logger = new Logger(RefinePlacesOnlinePipelineModule.name);
    /** Overlapping scheduled runs would ask for the same places; the second one steps aside. */
    private running = false;

    constructor(
        private readonly nominatim: NominatimClientService,
        private readonly placeGeocodeService: PlaceGeocodeService,
    ) {}

    public async executeModule(
        context: PipelineModuleExecutionContext<RefinePlacesOnlineInput>,
    ): Promise<RefinePlacesOnlineOutput> {
        if (this.running) {
            return this.output(context.dryRun, this.options(context.inputData), {
                placeCount: 0,
                pendingBefore: 0,
                remaining: 0,
                stoppedReason: 'Another refinement run is in progress',
            });
        }

        this.running = true;

        try {
            return await this.refine(context);
        } finally {
            this.running = false;
        }
    }

    private options(inputData: RefinePlacesOnlineInput) {
        return {
            maxPlaces: Math.round(positiveOr(inputData.maxPlaces, DEFAULTS.maxPlaces)),
            movedMeters: positiveOr(inputData.movedMeters, DEFAULTS.movedMeters),
            maxConsecutiveFailures: Math.round(
                positiveOr(inputData.maxConsecutiveFailures, DEFAULTS.maxConsecutiveFailures),
            ),
            refreshDays:
                typeof inputData.refreshDays === 'number' && inputData.refreshDays > 0 ? inputData.refreshDays : null,
            acceptLanguage: inputData.acceptLanguage?.trim() || DEFAULT_ACCEPT_LANGUAGE,
        };
    }

    private async refine({
        em,
        inputData,
        pipelineExecution,
        progress,
        dryRun,
    }: PipelineModuleExecutionContext<RefinePlacesOnlineInput>): Promise<RefinePlacesOnlineOutput> {
        const started = Date.now();
        const options = this.options(inputData);

        progress.message('Reading canonical places');
        const places = await this.placeGeocodeService.readPlaces();
        const { selected, pending } = selectPlacesToRefine(places, {
            now: new Date(),
            refreshDays: options.refreshDays ?? undefined,
            movedMeters: options.movedMeters,
            maxPlaces: options.maxPlaces,
        });

        if (dryRun) {
            progress.message(`Would refine ${formatCount(selected.length)} of ${formatCount(pending)} due places`);

            return this.output(dryRun, options, {
                placeCount: places.length,
                pendingBefore: pending,
                remaining: pending,
                sample: selected.slice(0, REPORTED_PLACES).map((place) => ({
                    id: place.id,
                    ...(place.name ? { name: place.name } : {}),
                })),
                started,
            });
        }

        const sample: RefinedPlaceEntry[] = [];
        const failedPlaces: { id: string; error: string }[] = [];
        let refined = 0;
        let notFound = 0;
        let consecutiveFailures = 0;
        let stoppedReason: string | null = null;

        progress.report({ message: 'Refining places', current: 0, total: selected.length, unit: 'places' });

        for (const [index, place] of selected.entries()) {
            if (index > 0 && index % ABORT_CHECK_INTERVAL === 0 && (await this.isAborted(em, pipelineExecution.id))) {
                stoppedReason = 'Execution aborted';
                break;
            }

            const result = await this.nominatim.client.reverse(place, options.acceptLanguage);

            if (!result.ok) {
                consecutiveFailures++;
                failedPlaces.push({ id: place.id, error: result.error });
                this.logger.warn(`Refining ${place.id} failed after ${result.attempts} attempt(s): ${result.error}`);

                if (consecutiveFailures >= options.maxConsecutiveFailures) {
                    stoppedReason = `${consecutiveFailures} places in a row failed (last: ${result.error})`;
                    break;
                }

                progress.report({ current: index + 1 });
                continue;
            }

            consecutiveFailures = 0;
            const props = buildRefinementProps(place, result.details, new Date());
            await this.placeGeocodeService.updatePlaces([{ id: place.id, props }]);

            if (result.details.osmFound) {
                refined++;
            } else {
                notFound++;
            }

            if (sample.length < REPORTED_PLACES) {
                sample.push(toEntry(place.id, props));
            }

            progress.report({
                current: index + 1,
                message: `Refined ${typeof props['name'] === 'string' ? props['name'] : place.id}`,
            });
        }

        const remaining = pending - refined - notFound;
        progress.message(
            `Refined ${formatCount(refined + notFound)} place(s), ${formatCount(remaining)} remaining` +
                (stoppedReason ? ` (stopped: ${stoppedReason})` : ''),
        );

        return this.output(dryRun, options, {
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
        options: RefinePlacesOnlineSummary['options'],
        values: {
            placeCount: number;
            pendingBefore: number;
            remaining: number;
            refined?: number;
            notFound?: number;
            failedPlaces?: { id: string; error: string }[];
            stoppedReason?: string | null;
            sample?: RefinedPlaceEntry[];
            started?: number;
        },
    ): RefinePlacesOnlineOutput {
        const refined = values.refined ?? 0;
        const failedPlaces = values.failedPlaces ?? [];

        return {
            refinedCount: refined + (values.notFound ?? 0),
            remaining: values.remaining,
            attribution: OSM_ATTRIBUTION,
            summary: {
                dryRun,
                options,
                nominatim: { baseUrl: this.nominatim.baseUrl, minIntervalMs: this.nominatim.client.minIntervalMs },
                placeCount: values.placeCount,
                pendingBefore: values.pendingBefore,
                refined,
                notFound: values.notFound ?? 0,
                failures: failedPlaces.length,
                failedPlaces: failedPlaces.slice(0, REPORTED_PLACES),
                remaining: values.remaining,
                stoppedReason: values.stoppedReason ?? null,
                durationMs: values.started === undefined ? 0 : Date.now() - values.started,
                sample: values.sample ?? [],
            },
        };
    }

    /** Aborting an execution does not interrupt the running module; this run checks for it every few places. */
    protected async isAborted(em: EntityManager, executionId: number): Promise<boolean> {
        try {
            const current = await em
                .fork()
                .findOne(PipelineExecutionEntity, { id: executionId }, { fields: ['executionStatus'] });

            return current?.executionStatus === PipelineExecutionStatusEnum.ABORTED;
        } catch (error) {
            this.logger.warn(`Could not check whether execution ${executionId} was aborted: ${String(error)}`);

            return false;
        }
    }
}

function toEntry(id: string, props: Record<string, unknown>): RefinedPlaceEntry {
    const entry: RefinedPlaceEntry = { id };

    for (const key of ['name', 'nameSource', 'osmName', 'road', 'city'] as const) {
        const value = props[key];

        if (typeof value === 'string') {
            entry[key] = value;
        }
    }

    return entry;
}
