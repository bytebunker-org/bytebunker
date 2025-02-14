import { compile } from 'json-schema-to-typescript';
import type { JSONSchema4 } from 'json-schema';
import fs from 'node:fs/promises';
import * as path from 'node:path';
import { googleLocationHistorySchemas } from './google/googleLocationSchemas.js';

async function main() {
    const schemaFolder = path.join(process.cwd(), 'src', 'extension', 'google', 'generatedType');
    console.info('Creating schema folder at', schemaFolder);
    await fs.mkdir(schemaFolder, { recursive: true });

    const asyncCompilation = false;

    const schemaAmount = Object.keys(googleLocationHistorySchemas).length;
    let finishedAmount = 0;

    const compilationFunctions = Object.entries(googleLocationHistorySchemas).map(
        ([name, jsonSchema], i) =>
            async () => {
                console.info(`(${i + 1}/${schemaAmount}) Compiling types for ${name} json schema`);

                try {
                    const typescriptCode = await compile(jsonSchema as JSONSchema4, name, {
                        format: false,
                    });

                    await fs.writeFile(path.join(schemaFolder, `${name}.ts`), typescriptCode, 'utf-8');

                    finishedAmount++;
                    console.log(`(${finishedAmount}/${schemaAmount}) Finished compiling types for ${name} json schema`);
                } catch (error) {
                    console.warn("Couldn't compile types for", name, error);
                }
            },
    );

    if (asyncCompilation) {
        await Promise.all(compilationFunctions.map((p) => p()));
    } else {
        for (const compilationFunction of compilationFunctions) {
            await compilationFunction();
        }
    }
}

main().catch((error) => console.error(error));
