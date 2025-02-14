import { compile } from 'json-schema-to-typescript';
import schemaOrgJsonSchemaExport from 'schema-org-json-schemas';
import type { JSONSchema4 } from 'json-schema';
import fs from 'node:fs/promises';
import type { FileInfo } from '@apidevtools/json-schema-ref-parser';
import * as path from 'node:path';
import { hardcodedSchemas } from './hardcodedSchemas.js';

const schemaOrgJsonSchemas = schemaOrgJsonSchemaExport as Record<string, JSONSchema4>;

async function main() {
    const schemaFolder = path.join(process.cwd(), 'src', 'schemaOrgTypes');
    console.info('Creating schema folder at', schemaFolder);
    await fs.mkdir(schemaFolder, { recursive: true });

    const asyncCompilation = false;

    const schemaAmount = Object.keys(schemaOrgJsonSchemas).length;
    let finishedAmount = 0;

    const compilationFunctions = Object.entries(schemaOrgJsonSchemas).map(([name, jsonSchema], i) => async () => {
        console.info(`(${i + 1}/${schemaAmount}) Compiling types for ${name} json schema`);

        try {
            const typescriptCode = await compile(jsonSchema, name, {
                $refOptions: {
                    resolve: {
                        schema: {
                            canRead: /^schema:\w+$/,
                            read: (file: FileInfo): JSONSchema4 => {
                                const schemaName = file.url.slice('schema:'.length);
                                const schema = schemaOrgJsonSchemas[schemaName];
                                const hardcodedSchema = hardcodedSchemas[schemaName];

                                const resolvedSchema = schema ?? hardcodedSchema;

                                if (!resolvedSchema) {
                                    throw new Error(`No schema found for ${file.url}`);
                                }

                                return structuredClone(resolvedSchema);
                            },
                        },
                    },
                },
                format: false,
                maxItems: 5,
            });

            await fs.writeFile(path.join(schemaFolder, `${name}.ts`), typescriptCode, 'utf-8');

            finishedAmount++;
            console.log(`(${finishedAmount}/${schemaAmount}) Finished compiling types for ${name} json schema`);
        } catch (error) {
            console.warn("Couldn't compile types for", name, error);
        }
    });

    if (asyncCompilation) {
        await Promise.all(compilationFunctions.map((p) => p()));
    } else {
        for (const compilationFunction of compilationFunctions) {
            await compilationFunction();
        }
    }
}

main().catch((error) => console.error(error));
