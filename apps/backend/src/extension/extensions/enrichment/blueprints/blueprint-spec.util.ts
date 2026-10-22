import { readFile } from 'node:fs/promises';
import path from 'node:path';
import 'reflect-metadata';
import type { JSONSchema7 } from 'json-schema';
import type { EntityManager } from '@mikro-orm/postgresql';
import { generateJsonSchema } from 'ts-decorator-json-schema-generator';
import type { BlueprintDataDto } from '../../../../etl/pipeline/blueprint/dto/blueprint-data.dto.js';
import { PipelineModuleService } from '../../../../etl/pipeline/pipeline-module/pipeline-module.service.js';
import {
    PIPELINE_MODULE_METADATA,
    type PipelineModuleOptions,
} from '../../../../etl/pipeline/pipeline-module/decorator/pipeline-module.decorator.js';
import type { Constructable } from '../../../../util/type/constructable.interface.js';

/**
 * The module rows the validation service reads from the database, built from the module classes the same way module
 * discovery does (ids from the class name, schemas from the input/output types plus the special ordering handles).
 */
export function moduleRow(moduleClass: Constructable<unknown>) {
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

/** An entity manager that answers the validation service's module lookup from the given rows. */
export function moduleEntityManager(modules: ReturnType<typeof moduleRow>[]): EntityManager {
    return {
        find: (_entity: unknown, where: { id?: { $in?: string[] } }) =>
            Promise.resolve(where.id?.$in ? modules.filter((module) => where.id!.$in!.includes(module.id)) : modules),
    } as unknown as EntityManager;
}

export async function loadBlueprint(fileName: string): Promise<{ title: string; data: BlueprintDataDto }> {
    return JSON.parse(await readFile(path.join(import.meta.dirname, fileName), 'utf8')) as {
        title: string;
        data: BlueprintDataDto;
    };
}

/** `[source module, source handle, target module, target handle]` per edge. */
export function edgeModules(data: BlueprintDataDto): [string?, string?, string?, string?][] {
    const moduleOf = (id: number) => data.nodes.find((node) => node.id === id)?.moduleId;

    return data.edges.map((edge) => [
        moduleOf(edge.source),
        edge.sourceHandle,
        moduleOf(edge.target),
        edge.targetHandle,
    ]);
}
