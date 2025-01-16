import type { EntityManager } from '@mikro-orm/postgresql';
import type { PipelineExecutionEntity } from '../entity/pipeline-execution.entity.js';
import type { BlueprintDataDto } from '../blueprint/dto/blueprint-data.dto.js';
import type { BlueprintNodeDto } from '../blueprint/dto/blueprint-node.dto.js';
import { CreateHoldExecutionDto } from '../dto/create-hold-execution.dto.js';

export interface IPipelineModule<Input, Output> {
    executeModule(
        inputData: Input,
        em: EntityManager,
        pipelineExecution: PipelineExecutionEntity,
        blueprintData: BlueprintDataDto,
        currentNode: BlueprintNodeDto,
    ): Output | (Output | CreateHoldExecutionDto) | Promise<Output> | Promise<Output | CreateHoldExecutionDto>;
}
