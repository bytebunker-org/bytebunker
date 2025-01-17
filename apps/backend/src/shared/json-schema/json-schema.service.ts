import { Inject, Injectable } from '@nestjs/common';
import type { JSONSchema7 } from 'json-schema';
import { JsonSchemaEntity } from './entity/json-schema.entity.js';
import type { AnySchemaObject } from 'ajv';
import {
    BYTEBUNKER_SCHEMA_HOST,
    BYTEBUNKER_SCHEMA_ORIGIN,
    SCHEMA_PARTIAL_PATH_REGEX,
    SCHEMA_PATH_REGEX,
} from './json-schema.constant.js';
import { HttpService } from '@nestjs/axios';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { FindAllJsonSchemaResponseDto } from './dto/find-all-json-schema-response.dto.js';
import { StoreJsonSchemaRequestDto } from './dto/store-json-schema-request.dto.js';
import type { EntityManager } from '@mikro-orm/postgresql';
import { BadRequestError } from '../../util/rest-error.js';

@Injectable()
export class JsonSchemaService {
    constructor(
        @Inject(CACHE_MANAGER) private cacheManager: Cache,
        private readonly httpService: HttpService,
    ) {}

    public findAll(em: EntityManager): Promise<FindAllJsonSchemaResponseDto[]> {
        return em.findAll(JsonSchemaEntity, {
            fields: ['schemaUri', 'title', 'description'],
        });
    }

    public getSchema(em: EntityManager, schemaUri: string): Promise<JSONSchema7> {
        schemaUri = this.normalizeAndValidateInternalSchemaUri(schemaUri);

        return this.cacheManager.wrap(`jsonSchema-${schemaUri}`, async () => {
            const jsonSchemaEntry = await em.findOneOrFail(
                JsonSchemaEntity,
                { schemaUri },
                {
                    fields: ['jsonSchema'],
                },
            );

            return jsonSchemaEntry.jsonSchema;
        });
    }

    public async getMultipleSchemas(em: EntityManager, schemaUriPrefix: string): Promise<JSONSchema7[]> {
        schemaUriPrefix = this.normalizeAndValidateInternalSchemaUri(schemaUriPrefix, true);

        const jsonSchemaList = await em.find(
            JsonSchemaEntity,
            {
                schemaUri: new RegExp('^' + schemaUriPrefix + '.*', 'i'),
            },
            {
                fields: ['jsonSchema'],
            },
        );

        return jsonSchemaList.map((entry) => entry.jsonSchema);
    }

    public storeMultiple(em: EntityManager, data: StoreJsonSchemaRequestDto): Promise<JsonSchemaEntity[]> {
        const jsonSchemaValues = data.jsonSchemas.map((jsonSchema) => {
            let schemaUri = jsonSchema.$id;

            if (!schemaUri) {
                throw new BadRequestError(`Can't register json schema without $id`);
            }

            schemaUri = this.normalizeAndValidateInternalSchemaUri(schemaUri);

            jsonSchema.$id = schemaUri;
            // Default to filename without .schema.json extension
            jsonSchema.title ??= schemaUri.slice(schemaUri.lastIndexOf('/') + 1, schemaUri.indexOf('.schema.json'));
            jsonSchema.$schema ??= 'http://json-schema.org/draft-07/schema';

            // This is correct, ajv doesn't work when the schema starts with https://
            if (jsonSchema.$schema.startsWith('https://')) {
                jsonSchema.$schema = jsonSchema.$schema.replace('https://', 'http://');
            }

            return new JsonSchemaEntity({
                schemaUri,
                title: jsonSchema.title!,
                description: jsonSchema.description,
                jsonSchema,
                extensionId: data.extensionId,
            });
        });

        return em.upsertMany(JsonSchemaEntity, jsonSchemaValues, {
            onConflictMergeFields: ['title', 'description', 'jsonSchema'],
        });
    }

    /**
     * Check if a schema uri belongs to an internal schema (on the schema.paralo.de domain)
     *
     * @param schemaUri
     * @param throwOnMalformedUri if an exception should be thrown, when the uri is malformed or else return false
     */
    public isInternalSchemaUri(schemaUri: string | URL, throwOnMalformedUri = true): boolean {
        let parsedUri: URL;

        try {
            parsedUri = typeof schemaUri === 'string' ? new URL(schemaUri) : schemaUri;
        } catch (error) {
            if (throwOnMalformedUri) {
                throw new BadRequestError(`Invalid schema uri ${schemaUri}`, error as Error);
            } else {
                return false;
            }
        }

        return parsedUri.host === BYTEBUNKER_SCHEMA_HOST;
    }

    /**
     * Normalize and validate schema uri to disallow accessing external schemas and fix or at least detect schema uri typos.
     * @param schemaUri
     * @param allowPartialPath allow paths not ending in a `.schema.json` filename. Requires paths to at least end with a `/`
     * @private
     */
    public normalizeAndValidateInternalSchemaUri(schemaUri: string, allowPartialPath = false): string {
        const originalSchemaUri = schemaUri;

        if (!schemaUri.startsWith('https://') && !schemaUri.startsWith('http://')) {
            schemaUri = BYTEBUNKER_SCHEMA_ORIGIN + '/' + schemaUri;
        }

        schemaUri = schemaUri.replace(/\/{2,}/, '/').toLowerCase();

        let parsedUri: URL;

        try {
            parsedUri = new URL(schemaUri);
        } catch (error) {
            throw new BadRequestError(`Invalid schema uri ${originalSchemaUri}`, error as Error);
        }

        if (!this.isInternalSchemaUri(parsedUri)) {
            throw new BadRequestError(
                `Invalid schema uri ${originalSchemaUri}, doesn't belong to an internal schema on ${BYTEBUNKER_SCHEMA_HOST}.`,
            );
        }

        if (!allowPartialPath && !parsedUri.pathname.endsWith('.schema.json')) {
            throw new BadRequestError(`Invalid schema uri ${originalSchemaUri}, has to end with ".schema.json".`);
        }

        const isValidPath = allowPartialPath
            ? SCHEMA_PARTIAL_PATH_REGEX.test(parsedUri.pathname)
            : SCHEMA_PATH_REGEX.test(parsedUri.pathname);
        if (!isValidPath) {
            if (allowPartialPath) {
                throw new BadRequestError(
                    `Invalid schema uri ${originalSchemaUri}, the schema filepath can be partial, but has to end in a "/" at least. Also, all path parts and filename can only contain a-z and dashes.`,
                );
            } else {
                throw new BadRequestError(
                    `Invalid schema uri ${originalSchemaUri}, the schema file must be in a sub-path and all path parts and filename can only contain a-z and dashes.`,
                );
            }
        }

        parsedUri.protocol = 'https:';
        parsedUri.username = '';
        parsedUri.password = '';
        parsedUri.search = '';
        parsedUri.hash = '';

        return parsedUri.href;
    }

    /**
     * Loads an internal schema or external schemas from json-schema.org
     * @param em
     * @param schemaUri
     */
    public async loadSchema(em: EntityManager, schemaUri: string): Promise<AnySchemaObject> {
        if (!this.isInternalSchemaUri(schemaUri)) {
            return this.loadExternalSchema(schemaUri);
        }

        const schemaObject = await this.getSchema(em, schemaUri);

        return schemaObject as AnySchemaObject;
    }

    private async loadExternalSchema(schemaUri: string): Promise<AnySchemaObject> {
        if (!schemaUri.startsWith('https://json-schema.org/') && !schemaUri.startsWith('http://json-schema.org/')) {
            throw new Error(`Disallowed external schema uri ${schemaUri}`);
        }

        const result = await this.httpService.axiosRef.get(schemaUri);

        return result.data;
    }
}
