import { PipelineExecutionStatusEnum } from '../../type/pipeline-execution-status.enum.js';

export type NodeProgressStatus = 'waiting' | 'running' | 'success' | 'failed' | 'aborted' | 'branch-ignored';

export class NodeProgressDto {
    public nodeId!: number;

    public status!: NodeProgressStatus;

    /** 0…1 for this node, undefined while running without a known total. */
    public fraction?: number;

    public current?: number;

    public total?: number;

    public unit?: string;

    /** Latest status message the module reported (kept after the node finished). */
    public message?: string;

    /** ISO timestamps */
    public startedAt?: string;

    public updatedAt?: string;

    public finishedAt?: string;
}

export class PipelineProgressDto {
    public executionId!: number;

    public executionStatus!: PipelineExecutionStatusEnum;

    public dryRun!: boolean;

    /** Weighted progress of the whole pipeline, 0…1. */
    public fraction!: number;

    /** Latest message of any running node, for a one-line summary. */
    public message?: string;

    public nodes!: NodeProgressDto[];
}
