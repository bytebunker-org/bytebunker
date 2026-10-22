import type { EntityManager } from '@mikro-orm/postgresql';
import type { PipelineExecutionEntity } from '../../entity/pipeline-execution.entity.js';
import type { BlueprintNodeDto } from '../../blueprint/dto/blueprint-node.dto.js';
import { CreateHoldExecutionDto } from '../../dto/create-hold-execution.dto.js';
import type { Blueprint } from '../../blueprint/util/blueprint.class.js';
import type { Loaded } from '@mikro-orm/core';
import type { ModuleProgressReporter } from '../../progress/type/module-progress-reporter.interface.js';
import type { FileDetection, FileSample } from '../../../import/type/file-detection.interface.js';

export interface PipelineModuleExecutionContext<Input> {
    em: EntityManager;
    pipelineExecution: Loaded<PipelineExecutionEntity, 'blueprint' | 'executionData'>;
    blueprint: Blueprint;
    currentNode: BlueprintNodeDto;
    inputData: Input;
    /** Optional progress and status reporting, shown live on the node and in the pipeline progress. */
    progress: ModuleProgressReporter;
    /** True for dry runs: read and compute as usual, but write nothing that outlives the execution. */
    dryRun: boolean;
}

export interface IPipelineModule<Input, Output> {
    /**
     * Optional, for modules that read an imported file: recognise the file by its content so it is routed to this
     * module's blueprints even when no trigger glob matches (localised takeout names, files dropped in the UI).
     * Return undefined (or confidence < 0.5) if the file is not for this module. Must be cheap: it sees only the
     * first 64 KB.
     */
    detectFile?(sample: FileSample): FileDetection | undefined;

    executeModule(
        data: PipelineModuleExecutionContext<Input>,
    ): Output | (Output | CreateHoldExecutionDto) | Promise<Output> | Promise<Output | CreateHoldExecutionDto>;
}
