import { Injectable, Logger } from '@nestjs/common';
import { type EntityManager } from '@mikro-orm/postgresql';
import { type DiscoveredClass, DiscoveryService } from '@golevelup/nestjs-discovery';
import { PIPELINE_MODULE_METADATA, type PipelineModuleOptions } from './decorator/pipeline-module.decorator.js';
import { PipelineModuleEntity } from './entity/pipeline-module.entity.js';
import { ExtensionEntity } from '../../../extension/entity/extension.entity.js';
import { PIPELINE_MODULE_CLASS_NAME_REGEX } from './pipeline-module.constant.js';
import type { Constructable } from '../../../util/type/constructable.interface.js';
import type { JSONSchema7 } from 'json-schema';
import { generateJsonSchema } from 'ts-decorator-json-schema-generator';
import { JsonSchemaService } from '../../../shared/json-schema/json-schema.service.js';
import type { IPipelineModule } from './type/pipeline-module.interface.js';
import { toHeaderCase } from 'js-convert-case';
import deepEqual from 'deep-equal';
import { diffString } from 'json-diff';
import { PipelineModuleTypeEnum } from './type/pipeline-module-type.enum.js';
import type { PipelineModuleIdentifier } from './type/pipeline-module-identifier.type.js';
import { buildModuleIdentifier, deconstructPipelineModuleIdentifier } from './pipeline-module-identifier.util.js';

@Injectable()
export class PipelineModuleService {
    private readonly logger = new Logger(PipelineModuleService.name);

    private readonly pipelineModuleRegistry = new Map<
        string,
        IPipelineModule<Record<string, unknown>, Record<string, unknown>>
    >();

    constructor(
        private readonly discoveryService: DiscoveryService,
        private readonly jsonSchemaService: JsonSchemaService,
    ) {}

    public async discoverPipelineModules(em: EntityManager): Promise<void> {
        const discoveredPipelineModules =
            await this.discoveryService.providersWithMetaAtKey<PipelineModuleOptions<unknown, unknown>>(
                PIPELINE_MODULE_METADATA,
            );

        for (const { discoveredClass, meta } of discoveredPipelineModules) {
            await this.registerPipelineModule(em, discoveredClass, meta);
        }
    }

    public getPipelineModule(
        identifier: PipelineModuleIdentifier,
    ): IPipelineModule<Record<string, unknown>, Record<string, unknown>> | undefined {
        return this.pipelineModuleRegistry.get(identifier);
    }

    public getAllPipelineModuleNames(): string[] {
        return [...this.pipelineModuleRegistry.keys()];
    }

    private async registerPipelineModule(
        em: EntityManager,
        discoveredClass: DiscoveredClass,
        moduleOptions: PipelineModuleOptions<unknown, unknown>,
    ): Promise<void> {
        const extension = await em.findOneOrFail(ExtensionEntity, { name: moduleOptions.extensionName });

        const { moduleName, moduleVersion: classNameModuleVersion } = this.extractModuleDetailsFromClassName(
            discoveredClass.name,
        );
        const moduleVersion = moduleOptions.version ?? 1;
        const moduleType = moduleOptions.type ?? PipelineModuleTypeEnum.NORMAL;

        if (moduleVersion !== classNameModuleVersion) {
            throw new Error(
                `Module version ${moduleVersion} does not match class name version ${classNameModuleVersion} (extracted from "${discoveredClass.name}")`,
            );
        }

        if (moduleType === PipelineModuleTypeEnum.TRIGGER && !moduleName.endsWith('trigger')) {
            throw new Error(`Trigger modules must end with "Trigger", found module class "${discoveredClass.name}"`);
        }

        const moduleIdentifier = buildModuleIdentifier(extension.name, moduleName, moduleVersion);

        const existingModule = await em.findOne(PipelineModuleEntity, {
            id: moduleIdentifier,
        });

        const inputTypeSchema = this.generateModuleJsonSchema('input', moduleOptions.inputType, moduleIdentifier);
        const outputTypeSchema = this.generateModuleJsonSchema('output', moduleOptions.outputType, moduleIdentifier);

        if (existingModule) {
            const existingInputTypeSchema = inputTypeSchema?.$id
                ? await this.jsonSchemaService.getSchema(em, inputTypeSchema.$id)
                : undefined;
            const existingOutputTypeSchema =
                outputTypeSchema?.$id === undefined
                    ? undefined
                    : await this.jsonSchemaService.getSchema(em, outputTypeSchema?.$id);

            const inputTypesEqual = deepEqual(existingInputTypeSchema, inputTypeSchema);
            const outputTypesEqual = deepEqual(existingOutputTypeSchema, outputTypeSchema);

            if (!inputTypesEqual || !outputTypesEqual) {
                this.logger.warn(
                    `Registering existing pipeline module ${moduleIdentifier} with different types but the same version`,
                );

                if (!inputTypesEqual) {
                    this.logger.warn(
                        `${moduleIdentifier} input types are different:`,
                        diffString(existingInputTypeSchema, inputTypeSchema),
                    );
                }

                if (!outputTypesEqual) {
                    this.logger.warn(
                        `${moduleIdentifier} output types are different:`,
                        diffString(existingOutputTypeSchema, outputTypeSchema),
                    );
                }

                return;
            }

            await this.jsonSchemaService.storeMultiple(em, {
                extensionId: extension.id,
                jsonSchemas: [inputTypeSchema, outputTypeSchema].filter(Boolean),
            });

            existingModule.inputTypeSchemaUri = inputTypeSchema?.$id;
            existingModule.outputTypeSchemaUri = outputTypeSchema?.$id;

            em.persist(existingModule);
        } else {
            await this.jsonSchemaService.storeMultiple(em, {
                extensionId: extension.id,
                jsonSchemas: [inputTypeSchema, outputTypeSchema].filter(Boolean),
            });

            em.create(PipelineModuleEntity, {
                extensionName: extension.name,
                extensionId: extension.id,
                extension: extension,
                name: moduleName,
                version: moduleVersion,
                type: moduleType,
                inputTypeSchemaUri: inputTypeSchema?.$id,
                outputTypeSchemaUri: outputTypeSchema?.$id,
            });
        }

        this.pipelineModuleRegistry.set(
            moduleIdentifier,
            discoveredClass.instance as IPipelineModule<Record<string, unknown>, Record<string, unknown>>,
        );

        this.logger.log(`Registered module ${moduleIdentifier}`);
    }

    private extractModuleDetailsFromClassName(className: string): { moduleName: string; moduleVersion: number } {
        const match = className.match(PIPELINE_MODULE_CLASS_NAME_REGEX);

        if (!match) {
            throw new Error(
                'Invalid pipeline module class name, should be in the format: "SomeFunctionPipelineModuleV1" (version is optional)',
            );
        }

        return {
            moduleName: match[1],
            moduleVersion: match[2] ? Number.parseInt(match[2].slice(1)) : 1,
        };
    }

    private generateModuleJsonSchema(
        schemaType: 'input' | 'output',
        typeClass: Constructable<unknown> | undefined,
        moduleIdentifier: PipelineModuleIdentifier,
    ): JSONSchema7 | undefined {
        if (!typeClass) {
            return;
        }

        const { extensionName, moduleName, moduleVersion } = deconstructPipelineModuleIdentifier(moduleIdentifier);

        const jsonSchema = generateJsonSchema(typeClass, {
            includeSubschemas: ($id) =>
                $id ? (this.jsonSchemaService.isInternalSchemaUri($id) ? 'reference' : 'anonymously') : 'anonymously',
        });

        jsonSchema.$id = this.jsonSchemaService.normalizeAndValidateInternalSchemaUri(
            `https://schema.paralo.de/module/${extensionName}/${moduleName}-v${moduleVersion}-${schemaType}.schema.json`,
        );
        jsonSchema.title =
            toHeaderCase(moduleName) + ' ' + (schemaType ? 'Pipeline Module Input' : 'Pipeline Module Output');

        // Every module has the dependantModules and success properties in the schema to allow easier connecting of modules
        // to mark one modules execution dependent on another even if it doesn't require the parent modules output
        jsonSchema.properties ??= {};
        if (schemaType === 'input') {
            jsonSchema.properties['dependentModules'] = {
                type: 'array',
                items: {
                    type: 'null',
                },
            };
        } else {
            jsonSchema.properties['success'] = {
                type: 'null',
            };
        }

        return jsonSchema;
    }
}
