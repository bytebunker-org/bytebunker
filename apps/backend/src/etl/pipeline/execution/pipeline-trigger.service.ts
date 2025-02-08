import { Injectable, Logger } from '@nestjs/common';
import type { EntityManager } from '@mikro-orm/postgresql';
import type { Constructable } from '../../../util/type/constructable.interface.js';
import type { BlueprintNodeDto } from '../blueprint/dto/blueprint-node.dto.js';
import type { AbstractTriggerPipelineModule } from '../pipeline-module/abstract-trigger-pipeline.module.js';
import { Reflector } from '@nestjs/core';
import { PipelineBlueprintEntity } from '../blueprint/entity/pipeline-blueprint.entity.js';
import {
    PIPELINE_MODULE_METADATA,
    type PipelineModuleOptions,
} from '../pipeline-module/decorator/pipeline-module.decorator.js';
import { PipelineModuleService } from '../pipeline-module/pipeline-module.service.js';
import { Blueprint } from '../blueprint/util/blueprint.class.js';
import { PipelineExecutionService } from './pipeline-execution.service.js';
import type { PipelineExecutionEntity } from '../entity/pipeline-execution.entity.js';

type PipelineTriggerContext<Input> = {
    blueprintEntity: PipelineBlueprintEntity;
    blueprint: Blueprint;
    node: BlueprintNodeDto<Input>;
};

@Injectable()
export class PipelineTriggerService {
    private readonly logger = new Logger(PipelineTriggerService.name);

    constructor(
        private readonly reflector: Reflector,
        private readonly pipelineModuleService: PipelineModuleService,
        private readonly pipelineExecutionService: PipelineExecutionService,
    ) {}

    public async findMatchingTriggerNodes<Input, Output>(
        em: EntityManager,
        triggerModuleClass: Constructable<AbstractTriggerPipelineModule<Input, Output>>,
        options?: {
            matchNode?: (context: PipelineTriggerContext<Input>) => boolean | Promise<boolean>;
        },
    ): Promise<PipelineTriggerContext<Input>[]> {
        const pipelineModuleOptions = this.reflector.get<PipelineModuleOptions<Input, Output>>(
            PIPELINE_MODULE_METADATA,
            triggerModuleClass,
        );

        const { moduleIdentifier } = this.pipelineModuleService.extractModuleDetails(
            triggerModuleClass,
            Object.create(triggerModuleClass.prototype),
            pipelineModuleOptions,
        );

        const blueprintsWithTrigger = await em.find(PipelineBlueprintEntity, {
            usedModules: {
                id: moduleIdentifier,
            },
        });

        const results = await Promise.all(
            blueprintsWithTrigger.map(async (blueprintEntity) => {
                const blueprint = new Blueprint(blueprintEntity.data);
                const node = blueprint.getNode<Input>(moduleIdentifier);

                if (!node) {
                    throw new Error(
                        `Blueprint ${blueprintEntity.title} is missing the trigger node with id ${moduleIdentifier} but the earlier sql query should have filtered for it`,
                    );
                }

                const doesNodeMatch = options?.matchNode
                    ? await options.matchNode({ blueprintEntity, blueprint, node })
                    : true;

                if (!doesNodeMatch) {
                    return undefined;
                }

                return {
                    blueprintEntity,
                    blueprint,
                    node,
                } satisfies PipelineTriggerContext<Input>;
            }),
        );

        return results.filter(Boolean);
    }

    public async executeBlueprintFromTrigger<Input, Output>(
        em: EntityManager,
        triggerModuleClass: Constructable<AbstractTriggerPipelineModule<Input, Output>>,
        {
            matchNode,
            buildNodeData,
        }: {
            matchNode?: (context: PipelineTriggerContext<Input>) => boolean | Promise<boolean>;
            buildNodeData: (context: PipelineTriggerContext<Input>) => Output | Promise<Output>;
        },
    ): Promise<PipelineExecutionEntity[]> {
        const triggerContexts = await this.findMatchingTriggerNodes(em, triggerModuleClass, {
            matchNode,
        });

        const results = await Promise.allSettled(
            triggerContexts.map(async (triggerContext) => {
                const outputData = await buildNodeData(triggerContext);

                return this.pipelineExecutionService.executeBlueprintFromTrigger(
                    em,
                    triggerContext.blueprintEntity.id,
                    triggerContext.node.id,
                    outputData,
                );
            }),
        );

        const createdPipelines: PipelineExecutionEntity[] = [];

        for (const result of results) {
            if (result.status === 'rejected') {
                this.logger.error('Failed to execute pipeline from trigger', {
                    error: result.reason,
                });
            } else if (result.status === 'fulfilled' && result.value) {
                createdPipelines.push(result.value);

                this.logger.debug('Successfully executed pipeline from trigger', {
                    pipelineExecutionId: result.value.id,
                });
            }
        }

        return createdPipelines;
    }
}
