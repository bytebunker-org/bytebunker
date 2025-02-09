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
import { toHeaderCase, toKebabCase, toSnakeCase } from 'js-convert-case';
import deepEqual from 'deep-equal';
import { diffString } from 'json-diff';
import { PipelineModuleTypeEnum } from './type/pipeline-module-type.enum.js';
import type { PipelineModuleIdentifier } from './type/pipeline-module-identifier.type.js';
import { buildModuleIdentifier, deconstructPipelineModuleIdentifier } from './util/pipeline-module-identifier.util.js';
import { JsonSchemaEntity } from '../../../shared/json-schema/entity/json-schema.entity.js';
import { AbstractTriggerPipelineModule } from './abstract-trigger-pipeline.module.js';
import { AppConfig } from '../../../util/config/app.config.js';

@Injectable()
export class PipelineModuleService {
    private readonly logger = new Logger(PipelineModuleService.name);

    private readonly pipelineModuleRegistry = new Map<string, IPipelineModule<unknown, unknown>>();

    constructor(
        private readonly discoveryService: DiscoveryService,
        private readonly jsonSchemaService: JsonSchemaService,
        private readonly config: AppConfig,
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

    public getPipelineModule(identifier: PipelineModuleIdentifier): IPipelineModule<unknown, unknown> | undefined {
        return this.pipelineModuleRegistry.get(identifier);
    }

    public getAllPipelineModuleNames(): string[] {
        return [...this.pipelineModuleRegistry.keys()];
    }

    public extractModuleDetails<Input = unknown, Output = unknown>(
        moduleClass: Pick<Constructable<IPipelineModule<Input, Output>>, 'name'>,
        moduleInstance: IPipelineModule<Input, Output>,
        moduleOptions: PipelineModuleOptions<Input, Output>,
    ): {
        moduleIdentifier: PipelineModuleIdentifier;
        moduleType: PipelineModuleTypeEnum;
        moduleExtension: string;
        moduleName: string;
        moduleVersion: number;
    } {
        const { moduleName, moduleVersion: classNameModuleVersion } = this.extractModuleDetailsFromClassName(
            moduleClass.name,
        );
        const moduleVersion = moduleOptions.version ?? 1;
        const moduleType = moduleOptions.type ?? PipelineModuleTypeEnum.NORMAL;

        if (moduleVersion !== classNameModuleVersion) {
            throw new Error(
                `Module version ${moduleVersion} does not match class name version ${classNameModuleVersion} (extracted from "${moduleClass.name}")`,
            );
        }

        const isTriggerModuleType = moduleType === PipelineModuleTypeEnum.TRIGGER;
        const isTriggerModuleClassName = moduleName.endsWith('-trigger');
        const isTriggerModuleClass = AbstractTriggerPipelineModule.isTriggerPipelineModule(moduleInstance);
        const couldBeTriggerModule = isTriggerModuleType || isTriggerModuleClassName || isTriggerModuleClass;
        const couldBeNormalModule = !isTriggerModuleType || !isTriggerModuleClassName || !isTriggerModuleClass;

        if (couldBeNormalModule && couldBeTriggerModule) {
            if (!isTriggerModuleClassName) {
                throw new Error(
                    `Can't determine module type, trigger modules class names must end with "Trigger", found module class name "${moduleClass.name}"`,
                );
            } else if (!isTriggerModuleClass) {
                throw new Error(
                    `Can't determine module type, trigger modules extend the AbstractTriggerPipelineModule class`,
                );
            } else if (!isTriggerModuleType) {
                throw new Error(
                    `Can't determine module type, trigger modules have their type set to "PipelineModuleTypeEnum.TRIGGER" in the decorator`,
                );
            }
        }

        const moduleIdentifier = buildModuleIdentifier(moduleOptions.extensionName, moduleName, moduleVersion);

        return {
            moduleIdentifier,
            moduleType,
            moduleExtension: moduleOptions.extensionName,
            moduleName,
            moduleVersion,
        };
    }

    public extractModuleDetailsFromClassName(className: string): { moduleName: string; moduleVersion: number } {
        const match = className.match(PIPELINE_MODULE_CLASS_NAME_REGEX);

        if (!match) {
            throw new Error(
                'Invalid pipeline module class name, should be in the format: "SomeFunctionPipelineModuleV1" (version is optional)',
            );
        }

        return {
            moduleName: toKebabCase(match[1]),
            moduleVersion: match[2] ? Number.parseInt(match[2].slice(1)) : 1,
        };
    }

    private async registerPipelineModule<Input = unknown, Output = unknown>(
        em: EntityManager,
        discoveredClass: DiscoveredClass,
        moduleOptions: PipelineModuleOptions<Input, Output>,
    ): Promise<void> {
        const extension = await em.findOneOrFail(ExtensionEntity, { name: moduleOptions.extensionName });

        const { moduleIdentifier, moduleName, moduleVersion, moduleType } = this.extractModuleDetails(
            discoveredClass,
            discoveredClass.instance as IPipelineModule<Input, Output>,
            moduleOptions,
        );

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

            if ((!inputTypesEqual || !outputTypesEqual) && this.config.nodeEnv !== 'development') {
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

            existingModule.inputTypeSchema = inputTypeSchema?.$id
                ? em.getReference(JsonSchemaEntity, inputTypeSchema?.$id, { wrapped: true })
                : undefined;
            existingModule.outputTypeSchema = outputTypeSchema?.$id
                ? em.getReference(JsonSchemaEntity, outputTypeSchema?.$id, { wrapped: true })
                : undefined;

            em.persist(existingModule);
        } else {
            await this.jsonSchemaService.storeMultiple(em, {
                extensionId: extension.id,
                jsonSchemas: [inputTypeSchema, outputTypeSchema].filter(Boolean),
            });

            em.create(PipelineModuleEntity, {
                id: moduleIdentifier,
                extensionName: extension.name,
                extension: extension,
                name: moduleName,
                version: moduleVersion,
                type: moduleType,
                inputTypeSchema: inputTypeSchema?.$id
                    ? em.getReference(JsonSchemaEntity, inputTypeSchema?.$id)
                    : undefined,
                outputTypeSchema: outputTypeSchema?.$id
                    ? em.getReference(JsonSchemaEntity, outputTypeSchema?.$id)
                    : undefined,
            });
        }

        this.pipelineModuleRegistry.set(moduleIdentifier, discoveredClass.instance as IPipelineModule<Input, Output>);

        this.logger.log(`Registered module ${moduleIdentifier}`);
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
            `https://schema.bytebunker.dev/module/${extensionName}/${moduleName}-v${moduleVersion}-${schemaType}.schema.json`,
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

        if (jsonSchema.$schema?.startsWith('https://')) {
            jsonSchema.$schema = jsonSchema.$schema.replace('https://', 'http://');
        }

        return jsonSchema;
    }
}
