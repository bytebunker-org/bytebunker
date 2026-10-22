import { Optional, Required, Type } from 'ts-decorator-json-schema-generator';
import { PipelineModule } from '../../../../etl/pipeline/pipeline-module/decorator/pipeline-module.decorator.js';
import { PipelineModuleJsonSchema } from '../../../../etl/pipeline/pipeline-module/decorator/pipeline-module-json-schema.decorator.js';
import type {
    IPipelineModule,
    PipelineModuleExecutionContext,
} from '../../../../etl/pipeline/pipeline-module/type/pipeline-module.interface.js';
import { RelationshipLabelEnum } from '../../../../activity-graph/relationship-label.enum.js';
import { ENRICHMENT_EXTENSION } from '../../local-extension.constant.js';
import { ActivityInputReaderService, type PlayInput } from '../graph/activity-input-reader.service.js';
import { DerivedGraphService } from '../graph/derived-graph.service.js';
import { buildDerivedProvenance } from '../graph/derived-graph.util.js';
import { formatCount, nonNegativeOr } from '../util/module-input.util.js';
import { linkPlaysToMoves, type PlaysPerMode } from '../util/plays-on-moves.util.js';

const DEFAULT_MIN_OVERLAP_SECONDS = 30;

@PipelineModuleJsonSchema()
export class LinkListensToMovesInput {
    /** Overlap (seconds) a play needs with a move; shorter plays need half their length. Default 30. */
    @Optional()
    @Type('number')
    public minOverlapSeconds?: number;

    /** Also link views (YouTube, Spotify videos), not only listens. Default true. */
    @Optional()
    @Type('boolean')
    public includeViews?: boolean;
}

export interface LinkListensToMovesSummary {
    dryRun: boolean;
    minOverlapSeconds: number;
    includeViews: boolean;
    moveCount: number;
    listenCount: number;
    viewCount: number;
    /** Plays linked to at least one move. */
    linkedPlays: number;
    duringEdges: number;
    /** Listens, views and minutes on the move per transport mode, most plays first. */
    perMode: PlaysPerMode[];
    replacedEdges: number;
}

@PipelineModuleJsonSchema()
export class LinkListensToMovesOutput {
    @Required()
    @Type('integer')
    public linkCount!: number;

    /** Plays on the move per transport mode. */
    @Required()
    @Type('object')
    public summary!: LinkListensToMovesSummary;
}

/**
 * Links listens (and views) to the moves they overlap with a `DURING` edge ("what I listened to on the train to
 * Paris"), found with an interval sweep over both lists. Replaces its previous output.
 */
@PipelineModule({
    extensionName: ENRICHMENT_EXTENSION,
    inputType: LinkListensToMovesInput,
    outputType: LinkListensToMovesOutput,
    description:
        'Links Listen/View activities to the Move they overlap (listen -[:DURING]-> move, with overlapSeconds and ' +
        'mode). Reports listens on the move per transport mode. Replaces its previous output.',
})
export class LinkListensToMovesPipelineModule
    implements IPipelineModule<LinkListensToMovesInput, LinkListensToMovesOutput>
{
    constructor(
        private readonly reader: ActivityInputReaderService,
        private readonly derivedGraphService: DerivedGraphService,
    ) {}

    public async executeModule({
        inputData,
        pipelineExecution,
        currentNode,
        progress,
        dryRun,
    }: PipelineModuleExecutionContext<LinkListensToMovesInput>): Promise<LinkListensToMovesOutput> {
        const minOverlapSeconds = nonNegativeOr(inputData.minOverlapSeconds, DEFAULT_MIN_OVERLAP_SECONDS);
        const includeViews = inputData.includeViews ?? true;
        const provenance = buildDerivedProvenance(currentNode.moduleId, pipelineExecution.id);

        progress.report({ message: 'Reading moves', current: 0, unit: 'activities' });
        const moves = await this.reader.readMoves((read) => progress.report({ current: read }));
        progress.message('Reading listens');
        const kinds: PlayInput['kind'][] = includeViews ? ['listen', 'view'] : ['listen'];
        const plays = await this.reader.readPlays(kinds, (read) => progress.report({ current: moves.length + read }));

        progress.message(`Joining ${formatCount(plays.length)} plays with ${formatCount(moves.length)} moves`);
        const result = linkPlaysToMoves(
            plays.map((play) => ({ id: play.id, kind: play.kind, start: play.start, end: play.end ?? play.start })),
            moves,
            { minOverlapSeconds },
        );
        const rows = result.links.map((link) => ({
            fromId: link.playId,
            toId: link.moveId,
            props: { overlapSeconds: link.overlapSeconds, mode: link.mode },
        }));

        if (!dryRun) {
            progress.report({ current: 0, total: rows.length, unit: 'edges', message: 'Writing DURING edges' });
        }

        const replacement = await this.derivedGraphService.replaceDerived(
            provenance,
            { nodeLabels: [], relationshipTypes: [RelationshipLabelEnum.DURING] },
            {
                dryRun,
                write: () =>
                    this.derivedGraphService.writeRelationships(
                        RelationshipLabelEnum.DURING,
                        rows,
                        provenance,
                        (written) => progress.report({ current: written, total: rows.length }),
                    ),
            },
        );

        progress.message(
            `${dryRun ? 'Would link' : 'Linked'} ${formatCount(result.linkedPlays)} play(s) to moves ` +
                `(${formatCount(rows.length)} edges)`,
        );

        return {
            linkCount: rows.length,
            summary: {
                dryRun,
                minOverlapSeconds,
                includeViews,
                moveCount: moves.length,
                listenCount: plays.filter((play) => play.kind === 'listen').length,
                viewCount: plays.filter((play) => play.kind === 'view').length,
                linkedPlays: result.linkedPlays,
                duringEdges: rows.length,
                perMode: result.perMode,
                replacedEdges: replacement.replacedRelationships,
            },
        };
    }
}
