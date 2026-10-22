import { readFile } from 'node:fs/promises';
import path from 'node:path';
import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import type { JSONSchema7 } from 'json-schema';
import type { EntityManager } from '@mikro-orm/postgresql';
import { generateJsonSchema } from 'ts-decorator-json-schema-generator';
import { PipelineBlueprintValidationService } from '../../../../etl/pipeline/blueprint/pipeline-blueprint-validation.service.js';
import type { BlueprintDataDto } from '../../../../etl/pipeline/blueprint/dto/blueprint-data.dto.js';
import { PipelineModuleService } from '../../../../etl/pipeline/pipeline-module/pipeline-module.service.js';
import {
    PIPELINE_MODULE_METADATA,
    type PipelineModuleOptions,
} from '../../../../etl/pipeline/pipeline-module/decorator/pipeline-module.decorator.js';
import { PipelineModuleTypeEnum } from '../../../../etl/pipeline/pipeline-module/type/pipeline-module-type.enum.js';
import type { Constructable } from '../../../../util/type/constructable.interface.js';
import { ScheduleTriggerPipelineModule } from '../../common-pipeline-triggers/pipeline-module/schedule-trigger.pipeline-module.js';
import { toDesiredSchedule } from '../../common-pipeline-triggers/schedule-trigger.util.js';
import { ConsolidatePlacesPipelineModule } from '../pipeline-module/consolidate-places.pipeline-module.js';
import { DeriveHomeWorkPipelineModule } from '../pipeline-module/derive-home-work.pipeline-module.js';
import { DeriveTripsPipelineModule } from '../pipeline-module/derive-trips.pipeline-module.js';
import { LinkListensToMovesPipelineModule } from '../pipeline-module/link-listens-to-moves.pipeline-module.js';
import { ConfirmEventsPipelineModule } from '../pipeline-module/confirm-events.pipeline-module.js';
import { DailySummaryPipelineModule } from '../pipeline-module/daily-summary.pipeline-module.js';

/**
 * The module rows the validation service reads from the database, built from the module classes the same way module
 * discovery does (ids from the class name, schemas from the input/output types plus the special ordering handles).
 */
function moduleRow(moduleClass: Constructable<unknown>) {
    const options = Reflect.getMetadata(PIPELINE_MODULE_METADATA, moduleClass) as PipelineModuleOptions<
        unknown,
        unknown
    >;
    const moduleService = new PipelineModuleService(undefined as never, undefined as never, undefined as never);
    const { moduleIdentifier, moduleType } = moduleService.extractModuleDetails(
        moduleClass,
        Object.create(moduleClass.prototype as object) as never,
        options,
    );
    const schema = (type: Constructable<unknown> | undefined, special: Record<string, JSONSchema7>) => {
        const jsonSchema = type ? (generateJsonSchema(type) as JSONSchema7) : { type: 'object' as const };

        return { $: { jsonSchema: { ...jsonSchema, properties: { ...jsonSchema.properties, ...special } } } };
    };

    return {
        id: moduleIdentifier,
        type: moduleType,
        inputTypeSchema: schema(options.inputType, { dependentModules: { type: 'array', items: { type: 'null' } } }),
        outputTypeSchema: schema(options.outputType, { success: { type: 'null' } }),
    };
}

const modules = [
    ScheduleTriggerPipelineModule,
    ConsolidatePlacesPipelineModule,
    DeriveHomeWorkPipelineModule,
    DeriveTripsPipelineModule,
    LinkListensToMovesPipelineModule,
    ConfirmEventsPipelineModule,
    DailySummaryPipelineModule,
].map((moduleClass) => moduleRow(moduleClass as Constructable<unknown>));

const em = {
    find: (_entity: unknown, where: { id?: { $in?: string[] } }) =>
        Promise.resolve(where.id?.$in ? modules.filter((module) => where.id!.$in!.includes(module.id)) : modules),
} as unknown as EntityManager;

async function loadBlueprint(): Promise<{ title: string; data: BlueprintDataDto }> {
    return JSON.parse(await readFile(path.join(import.meta.dirname, 'places.blueprint.json'), 'utf8')) as {
        title: string;
        data: BlueprintDataDto;
    };
}

describe('enrichment/places blueprint', () => {
    it('uses the modules under their discovered ids', () => {
        expect(modules.map((module) => [module.id, module.type])).toEqual([
            ['common-pipeline-triggers:schedule-trigger@1', PipelineModuleTypeEnum.TRIGGER],
            ['enrichment:consolidate-places@1', PipelineModuleTypeEnum.NORMAL],
            ['enrichment:derive-home-work@1', PipelineModuleTypeEnum.NORMAL],
            ['enrichment:derive-trips@1', PipelineModuleTypeEnum.NORMAL],
            ['enrichment:link-listens-to-moves@1', PipelineModuleTypeEnum.NORMAL],
            ['enrichment:confirm-events@1', PipelineModuleTypeEnum.NORMAL],
            ['enrichment:daily-summary@1', PipelineModuleTypeEnum.NORMAL],
        ]);
    });

    it('passes blueprint validation without issues', async () => {
        const { data } = await loadBlueprint();
        const result = await new PipelineBlueprintValidationService().validate(em, data);

        expect(result.issues).toEqual([]);
        expect(result.valid).toBe(true);
    });

    it('chains places, home/work, trips, listens on moves, events and daily summaries via the success handle', async () => {
        const { data } = await loadBlueprint();
        const moduleOf = (id: number) => data.nodes.find((node) => node.id === id)?.moduleId;

        expect(
            data.edges.map((edge) => [
                moduleOf(edge.source),
                edge.sourceHandle,
                moduleOf(edge.target),
                edge.targetHandle,
            ]),
        ).toEqual([
            [
                'common-pipeline-triggers:schedule-trigger@1',
                'success',
                'enrichment:consolidate-places@1',
                'dependentModules',
            ],
            ['enrichment:consolidate-places@1', 'success', 'enrichment:derive-home-work@1', 'dependentModules'],
            ['enrichment:derive-home-work@1', 'success', 'enrichment:derive-trips@1', 'dependentModules'],
            ['enrichment:derive-trips@1', 'success', 'enrichment:link-listens-to-moves@1', 'dependentModules'],
            ['enrichment:link-listens-to-moves@1', 'success', 'enrichment:confirm-events@1', 'dependentModules'],
            ['enrichment:confirm-events@1', 'success', 'enrichment:daily-summary@1', 'dependentModules'],
        ]);
    });

    it('has a schedule the trigger accepts', async () => {
        const { data } = await loadBlueprint();
        const trigger = data.nodes.find((node) =>
            node.moduleId.startsWith('common-pipeline-triggers:schedule-trigger'),
        )!;

        expect(toDesiredSchedule(1, trigger.id, trigger.constantInputData)).toMatchObject({
            pattern: '30 3 * * *',
            tz: 'Europe/Berlin',
        });
    });
});
