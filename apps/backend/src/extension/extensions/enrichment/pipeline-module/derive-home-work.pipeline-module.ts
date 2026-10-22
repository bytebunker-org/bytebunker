import { Inject } from '@nestjs/common';
import { Optional, Required, Type } from 'ts-decorator-json-schema-generator';
import { Neode } from '@bytebunker/neode';
import { PipelineModule } from '../../../../etl/pipeline/pipeline-module/decorator/pipeline-module.decorator.js';
import { PipelineModuleJsonSchema } from '../../../../etl/pipeline/pipeline-module/decorator/pipeline-module-json-schema.decorator.js';
import type {
    IPipelineModule,
    PipelineModuleExecutionContext,
} from '../../../../etl/pipeline/pipeline-module/type/pipeline-module.interface.js';
import { NEODE_PROVIDER } from '../../../../activity-graph/graph-database/neode.constant.js';
import { NodeLabelEnum } from '../../../../activity-graph/node-label.enum.js';
import { RelationshipLabelEnum } from '../../../../activity-graph/relationship-label.enum.js';
import { ActivityGraphService } from '../../../../activity-graph/activity-graph.service.js';
import { ENRICHMENT_EXTENSION } from '../../local-extension.constant.js';
import { DerivedGraphService } from '../graph/derived-graph.service.js';
import { buildDerivedProvenance } from '../graph/derived-graph.util.js';
import { parseGraphTime, type PlaceRole, ROLE_SEMANTIC_TYPES } from '../util/role-periods.util.js';
import {
    type ArriveVisitRow,
    assignCustomPlaces,
    classifyRoleVisits,
    type CustomPlaceAssignment,
    deriveRoleTimeline,
    type RolePeriodSource,
    type RoleTimelinePeriod,
} from '../util/custom-places.util.js';
import { CustomPlaceReadService } from '../custom-place/custom-place-read.service.js';
import { PlaceGeocodeService } from '../graph/place-geocode.service.js';

const DEFAULT_MAX_GAP_DAYS = 60;
const DEFAULT_MIN_TAKEOVER_VISITS = 3;
const REPORTED_PERIODS = 50;

const ROLE_RELATIONSHIPS: Record<PlaceRole, RelationshipLabelEnum> = {
    HOME: RelationshipLabelEnum.HOME_DURING,
    WORK: RelationshipLabelEnum.WORK_DURING,
};

@PipelineModuleJsonSchema()
export class DeriveHomeWorkInput {
    /** A place stops being home/work after this many days without a visit. Default 60. */
    @Optional()
    @Type('number')
    public maxGapDays?: number;

    /** Consecutive visits another place needs to become the new home/work place; fewer count as a detour. Default 3. */
    @Optional()
    @Type('integer')
    public minTakeoverVisits?: number;
}

export interface RolePeriodSummary {
    placeId: string;
    placeName?: string;
    /** True if the period points at a raw place because the place was never consolidated. */
    rawPlace: boolean;
    from: string;
    to: string;
    visitCount: number;
    inferred: boolean;
    /** `custom-period`: the validity of a custom home/work place; `visits`: derived from visits. */
    source: RolePeriodSource;
    /** The custom place the period's place lies in, if any. */
    customPlaceId?: number;
    customPlaceName?: string;
}

export interface DeriveHomeWorkSummary {
    dryRun: boolean;
    maxGapDays: number;
    minTakeoverVisits: number;
    homeVisitCount: number;
    workVisitCount: number;
    homePeriods: RolePeriodSummary[];
    workPeriods: RolePeriodSummary[];
    homePeriodCount: number;
    workPeriodCount: number;
    /** Visits at places that did not take over (detours), per role. */
    ignoredHomeVisits: number;
    ignoredWorkVisits: number;
    /** Custom places defined (Settings → Eigene Orte) and canonical places inside one. */
    customPlaceCount: number;
    customMatchedPlaces: number;
    /** Visits whose role came from a custom home/work place instead of Google's semanticType. */
    customHomeVisitCount: number;
    customWorkVisitCount: number;
    /** Visits Google marked home/work that a custom place of another role overrode. */
    overriddenVisitCount: number;
    /** Periods taken from the validity of custom home/work places (authoritative). */
    customPeriods: (RolePeriodSummary & { role: PlaceRole })[];
    /** Custom home/work places with validity that no canonical place lies in (no period could be written). */
    unmatchedCustomPlaces: { id: number; name: string }[];
    replacedEdges: number;
}

@PipelineModuleJsonSchema()
export class DeriveHomeWorkOutput {
    @Required()
    @Type('integer')
    public periodCount!: number;

    /** The derived home and work periods. */
    @Required()
    @Type('object')
    public summary!: DeriveHomeWorkSummary;
}

interface PlaceVisitRow {
    startTime: unknown;
    endTime: unknown;
    semanticType: string;
    placeId: string;
    placeName: string | null;
    canonical: boolean;
}

/**
 * Derives where the owner lived and worked over time from the Google Timeline visit `semanticType`s (HOME,
 * INFERRED_HOME, WORK, INFERRED_WORK): `(owner)-[:HOME_DURING {from, to, visitCount, inferred}]->(place)` and
 * `WORK_DURING` likewise. Places are the canonical places (via SAME_AS) when consolidate-places ran, else the raw ones.
 *
 * Custom places (Settings → Eigene Orte) come first: every visit at a canonical place inside a custom home/work place
 * counts as home/work there (within its validFrom/validTo), whatever Google said; a custom `other` place cancels
 * Google's home/work. A custom home/work place with validFrom/validTo gives that period directly.
 */
@PipelineModule({
    extensionName: ENRICHMENT_EXTENSION,
    inputType: DeriveHomeWorkInput,
    outputType: DeriveHomeWorkOutput,
    description:
        'Derives HOME_DURING / WORK_DURING periods (owner person -> place, with from/to) from timeline visits marked ' +
        'home or work. Run after consolidate-places so periods point at canonical places. Replaces its previous output.',
})
export class DeriveHomeWorkPipelineModule implements IPipelineModule<DeriveHomeWorkInput, DeriveHomeWorkOutput> {
    constructor(
        @Inject(NEODE_PROVIDER) private readonly neode: Neode,
        private readonly derivedGraphService: DerivedGraphService,
        private readonly activityGraphService: ActivityGraphService,
        private readonly placeGeocodeService: PlaceGeocodeService,
        private readonly customPlaceReadService: CustomPlaceReadService,
    ) {}

    public async executeModule({
        em,
        inputData,
        pipelineExecution,
        currentNode,
        progress,
        dryRun,
    }: PipelineModuleExecutionContext<DeriveHomeWorkInput>): Promise<DeriveHomeWorkOutput> {
        const maxGapDays = positiveOr(inputData.maxGapDays, DEFAULT_MAX_GAP_DAYS);
        const minTakeoverVisits = Math.round(positiveOr(inputData.minTakeoverVisits, DEFAULT_MIN_TAKEOVER_VISITS));
        const provenance = buildDerivedProvenance(currentNode.moduleId, pipelineExecution.id);

        const customPlaces = await this.customPlaceReadService.readForExecution(pipelineExecution.id);
        let assignments = new Map<string, CustomPlaceAssignment>();
        const placeNames = new Map<string, string>();

        if (customPlaces.length) {
            progress.message('Matching custom places');
            const places = await this.placeGeocodeService.readPlaces();
            assignments = assignCustomPlaces(places, customPlaces);

            for (const place of places) {
                if (assignments.has(place.id) && place.name) {
                    placeNames.set(place.id, place.name);
                }
            }
        }

        progress.message('Reading home and work visits');
        const rows = [...(await this.readVisits()), ...(await this.readOtherVisitsAt([...assignments.keys()]))];
        const placeInfo = new Map(
            rows.map((row) => [row.placeId, { name: row.placeName ?? undefined, canonical: row.canonical }]),
        );

        for (const [id, name] of placeNames) {
            placeInfo.set(id, { name, canonical: true });
        }

        const visitRows: ArriveVisitRow[] = [];

        for (const row of rows) {
            const start = parseGraphTime(row.startTime);

            if (start !== undefined) {
                visitRows.push({
                    placeId: row.placeId,
                    start,
                    end: parseGraphTime(row.endTime) ?? start,
                    semanticType: row.semanticType,
                });
            }
        }

        const classified = classifyRoleVisits(visitRows, assignments);
        const options = { maxGapDays, minTakeoverVisits };
        const now = Date.now();
        const home = deriveRoleTimeline('HOME', classified.visits.HOME, customPlaces, assignments, options, now);
        const work = deriveRoleTimeline('WORK', classified.visits.WORK, customPlaces, assignments, options, now);
        const customPlaceNames = new Map(customPlaces.map((customPlace) => [customPlace.id, customPlace.name]));

        const owner = await this.activityGraphService.getOwnerActor(em);
        const ownerId = owner.get('id');

        if (!ownerId) {
            throw new Error('The owner person node has no id');
        }

        const toRows = (periods: RoleTimelinePeriod[]) =>
            periods.map((period) => ({
                fromId: ownerId,
                toId: period.placeId,
                props: {
                    from: new Date(period.from).toISOString(),
                    to: new Date(period.to).toISOString(),
                    visitCount: period.visitCount,
                    inferredVisitCount: period.inferredVisitCount,
                    inferred: period.inferred,
                    source: period.source,
                    ...(period.customPlaceId === undefined ? {} : { customPlaceId: period.customPlaceId }),
                },
            }));

        progress.message(dryRun ? 'Computing periods (dry run)' : 'Writing periods');
        const replacement = await this.derivedGraphService.replaceDerived(
            provenance,
            { nodeLabels: [], relationshipTypes: [ROLE_RELATIONSHIPS.HOME, ROLE_RELATIONSHIPS.WORK] },
            {
                dryRun,
                write: async () => {
                    await this.derivedGraphService.writeRelationships(
                        ROLE_RELATIONSHIPS.HOME,
                        toRows(home.periods),
                        provenance,
                    );
                    await this.derivedGraphService.writeRelationships(
                        ROLE_RELATIONSHIPS.WORK,
                        toRows(work.periods),
                        provenance,
                    );
                },
            },
        );

        const summarisePeriod = (period: RoleTimelinePeriod): RolePeriodSummary => {
            const info = placeInfo.get(period.placeId);
            const customPlaceName =
                period.customPlaceId === undefined ? undefined : customPlaceNames.get(period.customPlaceId);

            return {
                placeId: period.placeId,
                ...(info?.name ? { placeName: info.name } : {}),
                rawPlace: !info?.canonical,
                from: new Date(period.from).toISOString(),
                to: new Date(period.to).toISOString(),
                visitCount: period.visitCount,
                inferred: period.inferred,
                source: period.source,
                ...(period.customPlaceId === undefined ? {} : { customPlaceId: period.customPlaceId }),
                ...(customPlaceName ? { customPlaceName } : {}),
            };
        };
        const summarise = (periods: RoleTimelinePeriod[]): RolePeriodSummary[] =>
            periods.slice(-REPORTED_PERIODS).map(summarisePeriod);
        const customPeriods = (role: PlaceRole, periods: RoleTimelinePeriod[]) =>
            periods
                .filter((period) => period.source === 'custom-period')
                .map((period) => ({ ...summarisePeriod(period), role }));

        progress.message(
            `${dryRun ? 'Would derive' : 'Derived'} ${home.periods.length} home and ${work.periods.length} work period(s)`,
        );

        return {
            periodCount: home.periods.length + work.periods.length,
            summary: {
                dryRun,
                maxGapDays,
                minTakeoverVisits,
                homeVisitCount: classified.visits.HOME.length,
                workVisitCount: classified.visits.WORK.length,
                homePeriods: summarise(home.periods),
                workPeriods: summarise(work.periods),
                homePeriodCount: home.periods.length,
                workPeriodCount: work.periods.length,
                ignoredHomeVisits: home.ignoredVisitCount,
                ignoredWorkVisits: work.ignoredVisitCount,
                customPlaceCount: customPlaces.length,
                customMatchedPlaces: assignments.size,
                customHomeVisitCount: classified.customVisitCount.HOME,
                customWorkVisitCount: classified.customVisitCount.WORK,
                overriddenVisitCount: classified.overriddenVisitCount,
                customPeriods: [...customPeriods('HOME', home.periods), ...customPeriods('WORK', work.periods)],
                unmatchedCustomPlaces: [...home.unmatchedCustomPlaceIds, ...work.unmatchedCustomPlaceIds].map((id) => ({
                    id,
                    name: customPlaceNames.get(id) ?? '',
                })),
                replacedEdges: replacement.replacedRelationships,
            },
        };
    }

    /**
     * Arrives at the given canonical places (those inside custom places) that {@link readVisits} does not read: no
     * home/work semanticType. A custom home/work place makes them home/work visits.
     */
    private async readOtherVisitsAt(canonicalIds: string[]): Promise<PlaceVisitRow[]> {
        if (!canonicalIds.length) {
            return [];
        }

        const result = await this.neode.readCypher(
            `UNWIND $ids AS id
             MATCH (c:${NodeLabelEnum.AS_OBJECT} { id: id })
             WHERE c:${NodeLabelEnum.CANONICAL_PLACE}
             MATCH (c)<-[:${RelationshipLabelEnum.SAME_AS}]-(:${NodeLabelEnum.PLACE})<-[:${RelationshipLabelEnum.TO}]-(a:${NodeLabelEnum.ACTIVITY_ARRIVE})
             WHERE a.startTime IS NOT NULL AND NOT coalesce(a.semanticType, '') IN $semanticTypes
             WITH DISTINCT a, c
             RETURN a.startTime AS startTime, a.endTime AS endTime, a.semanticType AS semanticType,
                    c.id AS placeId, c.name AS placeName`,
            { ids: canonicalIds, semanticTypes: ROLE_SEMANTIC_TYPES },
        );

        return result.records.map((record) => ({
            startTime: record.get('startTime'),
            endTime: record.get('endTime'),
            semanticType: record.get('semanticType'),
            placeId: record.get('placeId'),
            placeName: record.get('placeName'),
            canonical: true,
        }));
    }

    private async readVisits(): Promise<PlaceVisitRow[]> {
        const result = await this.neode.readCypher<{
            startTime: unknown;
            endTime: unknown;
            semanticType: string;
            placeId: string;
            placeName: string | null;
            canonical: boolean;
        }>(
            `MATCH (a:${NodeLabelEnum.ACTIVITY_ARRIVE})-[:${RelationshipLabelEnum.TO}]->(p:${NodeLabelEnum.PLACE})
             WHERE a.semanticType IN $semanticTypes AND a.startTime IS NOT NULL
             OPTIONAL MATCH (p)-[:${RelationshipLabelEnum.SAME_AS}]->(c:${NodeLabelEnum.CANONICAL_PLACE})
             WITH a, p, head(collect(c)) AS c
             RETURN a.startTime AS startTime, a.endTime AS endTime, a.semanticType AS semanticType,
                    coalesce(c.id, p.id) AS placeId, coalesce(c.name, p.name) AS placeName, c IS NOT NULL AS canonical`,
            { semanticTypes: ROLE_SEMANTIC_TYPES },
        );

        return result.records.map((record) => ({
            startTime: record.get('startTime'),
            endTime: record.get('endTime'),
            semanticType: record.get('semanticType'),
            placeId: record.get('placeId'),
            placeName: record.get('placeName'),
            canonical: record.get('canonical'),
        }));
    }
}

function positiveOr(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}
