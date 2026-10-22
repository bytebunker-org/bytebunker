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
import {
    deriveRolePeriods,
    parseGraphTime,
    type PlaceRole,
    type RolePeriod,
    ROLE_SEMANTIC_TYPES,
    roleOfSemanticType,
    type RoleVisit,
} from '../util/role-periods.util.js';

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

        progress.message('Reading home and work visits');
        const rows = await this.readVisits();
        const placeInfo = new Map(
            rows.map((row) => [row.placeId, { name: row.placeName ?? undefined, canonical: row.canonical }]),
        );
        const visitsByRole: Record<PlaceRole, RoleVisit[]> = { HOME: [], WORK: [] };

        for (const row of rows) {
            const role = roleOfSemanticType(row.semanticType);
            const start = parseGraphTime(row.startTime);

            if (!role || start === undefined) {
                continue;
            }

            visitsByRole[role.role].push({
                placeId: row.placeId,
                start,
                end: parseGraphTime(row.endTime) ?? start,
                inferred: role.inferred,
            });
        }

        const options = { maxGapDays, minTakeoverVisits };
        const home = deriveRolePeriods(visitsByRole.HOME, options);
        const work = deriveRolePeriods(visitsByRole.WORK, options);

        const owner = await this.activityGraphService.getOwnerActor(em);
        const ownerId = owner.get('id');

        if (!ownerId) {
            throw new Error('The owner person node has no id');
        }

        const toRows = (periods: RolePeriod[]) =>
            periods.map((period) => ({
                fromId: ownerId,
                toId: period.placeId,
                props: {
                    from: new Date(period.from).toISOString(),
                    to: new Date(period.to).toISOString(),
                    visitCount: period.visitCount,
                    inferredVisitCount: period.inferredVisitCount,
                    inferred: period.inferred,
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

        const summarise = (periods: RolePeriod[]): RolePeriodSummary[] =>
            periods.slice(-REPORTED_PERIODS).map((period) => {
                const info = placeInfo.get(period.placeId);

                return {
                    placeId: period.placeId,
                    ...(info?.name ? { placeName: info.name } : {}),
                    rawPlace: !info?.canonical,
                    from: new Date(period.from).toISOString(),
                    to: new Date(period.to).toISOString(),
                    visitCount: period.visitCount,
                    inferred: period.inferred,
                };
            });

        progress.message(
            `${dryRun ? 'Would derive' : 'Derived'} ${home.periods.length} home and ${work.periods.length} work period(s)`,
        );

        return {
            periodCount: home.periods.length + work.periods.length,
            summary: {
                dryRun,
                maxGapDays,
                minTakeoverVisits,
                homeVisitCount: visitsByRole.HOME.length,
                workVisitCount: visitsByRole.WORK.length,
                homePeriods: summarise(home.periods),
                workPeriods: summarise(work.periods),
                homePeriodCount: home.periods.length,
                workPeriodCount: work.periods.length,
                ignoredHomeVisits: home.ignoredVisitCount,
                ignoredWorkVisits: work.ignoredVisitCount,
                replacedEdges: replacement.replacedRelationships,
            },
        };
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
