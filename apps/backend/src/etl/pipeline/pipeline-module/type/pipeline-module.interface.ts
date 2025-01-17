import type { EntityManager } from '@mikro-orm/postgresql';
import type { PipelineExecutionEntity } from '../../entity/pipeline-execution.entity.js';
import type { BlueprintNodeDto } from '../../blueprint/dto/blueprint-node.dto.js';
import { CreateHoldExecutionDto } from '../../dto/create-hold-execution.dto.js';
import type { Blueprint } from '../../blueprint/util/blueprint.class.js';
import type { Loaded } from '@mikro-orm/core';

export interface PipelineModuleExecutionContext<Input> {
    em: EntityManager;
    pipelineExecution: Loaded<PipelineExecutionEntity, 'blueprint' | 'executionData'>;
    blueprint: Blueprint;
    currentNode: BlueprintNodeDto;
    inputData: Input;
}

export interface IPipelineModule<Input, Output> {
    executeModule(
        data: PipelineModuleExecutionContext<Input>,
    ): Output | (Output | CreateHoldExecutionDto) | Promise<Output> | Promise<Output | CreateHoldExecutionDto>;
}
