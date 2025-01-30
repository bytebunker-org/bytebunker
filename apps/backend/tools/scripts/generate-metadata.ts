import { PluginMetadataGenerator } from '@nestjs/cli/lib/compiler/plugins/plugin-metadata-generator.js';
import { ReadonlyVisitor } from '@nestjs/swagger/dist/plugin/index.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const currentDirname = path.dirname(fileURLToPath(import.meta.url));
const sourceDirectory = currentDirname + '/../../src';

const generator = new PluginMetadataGenerator();
generator.generate({
    visitors: [
        new ReadonlyVisitor({
            introspectComments: true,
            pathToSource: sourceDirectory,
            classValidatorShim: true,
        }),
    ],
    outputDir: sourceDirectory,
    tsconfigPath: './tsconfig.json',
});

const metadataFilePath = sourceDirectory + '/metadata.ts';
let metadata: string = fs.readFileSync(metadataFilePath, 'utf8');

metadata = metadata.replaceAll(String.raw`\", { with: { \"resolution-mode\": \"import"]: `, '"]: ');
metadata = metadata.replaceAll(/import\("([\w./-]+)"/g, (match, g1) => `import("${g1}.js"`);
metadata = metadata.replaceAll(/t\["([\w./-]+)", { with: { "resolution-mode": "import"]/g, (match, g1) => `t["${g1}"]`);
metadata = metadata.replaceAll(', { with: { "resolution-mode": "import" } }', '');

fs.writeFileSync(metadataFilePath, metadata, 'utf8');
