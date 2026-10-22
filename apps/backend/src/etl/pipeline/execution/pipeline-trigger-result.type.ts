import type { PipelineExecutionEntity } from '../entity/pipeline-execution.entity.js';
import type { PipelineExecutionStatusEnum } from '../type/pipeline-execution-status.enum.js';

interface PipelineTriggerResultBase {
    blueprintId: number;
    blueprintTitle: string;
    /** Id of the trigger node inside the blueprint that matched */
    nodeId: number;
}

/** A new pipeline execution was created and scheduled for this blueprint. */
export interface CreatedPipelineTriggerResult extends PipelineTriggerResultBase {
    status: 'created';
    execution: PipelineExecutionEntity;
}

/**
 * No execution was created because the same trigger asset was already run through this blueprint.
 * The reason is human readable and safe to surface in logs or to the user.
 */
export interface SkippedPipelineTriggerResult extends PipelineTriggerResultBase {
    status: 'skipped';
    reason: string;
    existingExecutionId: number;
    existingExecutionStatus: PipelineExecutionStatusEnum.SUCCESS | PipelineExecutionStatusEnum.WAITING;
}

/** Creating the execution threw. The error is kept so callers can report it without parsing logs. */
export interface FailedPipelineTriggerResult extends PipelineTriggerResultBase {
    status: 'failed';
    error: unknown;
}

export type PipelineTriggerResult =
    | CreatedPipelineTriggerResult
    | SkippedPipelineTriggerResult
    | FailedPipelineTriggerResult;
