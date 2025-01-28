import type { ExportDeclarationStructure, ImportDeclarationStructure, OptionalKind } from 'ts-morph';
import { Project, StructureKind } from 'ts-morph';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { glob } from 'glob';

const currentDirname = path.dirname(fileURLToPath(import.meta.url));
const libraryDirectory = path.resolve(currentDirname, '../../lib');

const rewrittenImportModuleNames = new Set(['@nestjs/swagger', '@nestjs/mapped-types', '@mikro-orm/core']);
const rewrittenImportNames = new Set([
    'PickType',
    'OmitType',
    'PartialType',
    'IntersectionType',
    'PrimaryKeyProp',
    'PopulatePath',
    'AutoPath',
    'FilterObject',
    'FindOptions',
    'ObjectQuery',
    'OrderDefinition',
    'Populate',
    'PopulateHint',
    'Opt',
    'DtoRef',
    'DtoCollection',
]);
const preventIndexImportRegexes: RegExp[] = [/dto-ref.type/, /dto-collection.type/];

function rewriteDtoImports(project: Project) {
    const dtoFiles = project.getSourceFiles('src/**/*.dto.ts');

    console.info(`Processing ${dtoFiles.length} dto files...`);

    const generatedLibraryIndexFile = project.getSourceFile('src/util/generated-library-imports/index.ts');

    if (!generatedLibraryIndexFile) {
        throw new Error('Index file for rewritten library imports not found');
    }

    for (const dtoFile of dtoFiles) {
        for (const dtoClass of dtoFile.getClasses()) {
            if (!dtoClass.isExported() || !dtoClass.getName()?.endsWith('Dto')) {
                continue;
            }

            const structure = dtoClass.getStructure();

            structure.decorators = [];
            structure.properties ??= [];
            for (const p of structure.properties) p.decorators = [];

            dtoClass.set(structure);
        }

        const structure = dtoFile.getStructure();

        if (Array.isArray(structure.statements)) {
            const rewrittenLibraryImports: { name: string; isTypeOnly: boolean }[] = [];
            const removedStatements: (ImportDeclarationStructure | unknown)[] = [];

            for (const statement of structure.statements) {
                if (typeof statement === 'object' && statement.kind === StructureKind.ImportDeclaration) {
                    const moduleSpecifierMatches =
                        rewrittenImportModuleNames.has(statement.moduleSpecifier) ||
                        statement.moduleSpecifier.includes('dto-ref.type') ||
                        statement.moduleSpecifier.includes('dto-collection.type');

                    if (moduleSpecifierMatches && Array.isArray(statement.namedImports)) {
                        statement.namedImports = statement.namedImports.filter((namedImport) => {
                            if (typeof namedImport === 'object' && rewrittenImportNames.has(namedImport.name)) {
                                rewrittenLibraryImports.push({
                                    name: namedImport.name,
                                    isTypeOnly: (statement.isTypeOnly || namedImport.isTypeOnly) ?? false,
                                });

                                return false;
                            } else {
                                return true;
                            }
                        });

                        if (!statement.namedImports.length) {
                            removedStatements.push(statement);
                        }
                    }
                }
            }

            structure.statements = structure.statements.filter((s) => !removedStatements.includes(s));

            const codeImports = rewrittenLibraryImports.filter((importDecl) => !importDecl.isTypeOnly);
            const typeImports = rewrittenLibraryImports.filter((importDecl) => importDecl.isTypeOnly);

            if (codeImports.length) {
                structure.statements.unshift({
                    kind: StructureKind.ImportDeclaration,
                    namedImports: codeImports.map((importDecl) => importDecl.name),
                    moduleSpecifier: dtoFile.getRelativePathAsModuleSpecifierTo(generatedLibraryIndexFile) + '.js',
                });
            }

            if (typeImports.length) {
                structure.statements.unshift({
                    kind: StructureKind.ImportDeclaration,
                    namedImports: typeImports.map((importDecl) => importDecl.name),
                    moduleSpecifier: dtoFile.getRelativePathAsModuleSpecifierTo(generatedLibraryIndexFile) + '.js',
                    isTypeOnly: true,
                });
            }
        }

        dtoFile.set(structure);
        dtoFile.organizeImports({}, { importModuleSpecifierEnding: 'js' });
    }
}

function convertClasses(project: Project) {
    const files = project.getSourceFiles('src/**/*.ts');

    console.info(`Processing ${files.length} files to remove decorators...`);

    for (const file of files) {
        project.forgetNodesCreatedInBlock(() => {
            for (const classDeclaration of file.getClasses()) {
                const classStructure = classDeclaration.getStructure();
                if (classStructure.properties) for (const p of classStructure.properties) p.decorators = [];
                classDeclaration.set(classStructure);
            }
        });
    }
}

function generateIndexFiles(project: Project) {
    const indexFile = project.createSourceFile('src/index.ts');

    const exportedFiles = project.getSourceFiles().filter((file) => {
        const path = indexFile.getRelativePathAsModuleSpecifierTo(file) + '.js';

        for (const regex of preventIndexImportRegexes) {
            if (regex.test(path)) {
                console.info(`Skipping index file export of ${path}...`);

                return false;
            }
        }

        return true;
    });

    console.info(`Generating index file containing re-exports from ${exportedFiles.length} files...`);

    indexFile.addExportDeclarations(
        exportedFiles.map((exportedFile) => {
            console.info(
                'Exporting everything from',
                indexFile.getRelativePathAsModuleSpecifierTo(exportedFile) + '.js',
            );

            return {
                kind: StructureKind.ExportDeclaration,
                moduleSpecifier: indexFile.getRelativePathAsModuleSpecifierTo(exportedFile) + '.js',
            } satisfies OptionalKind<ExportDeclarationStructure>;
        }),
    );

    console.info('Done');
}

async function cleanJsFileImports() {
    const jsFiles = await glob(libraryDirectory + '/**/*.js');

    await Promise.allSettled(
        jsFiles.map(async (file) => {
            let fileContents = await fs.readFile(file, 'utf8');

            const isEmptyFile = !/^[^/i]/m.test(fileContents);
            if (isEmptyFile) {
                if (fileContents.includes('//# sourceMappingURL')) {
                    fileContents = fileContents.slice(fileContents.indexOf('//#'));
                } else {
                    fileContents = '';
                }

                await fs.writeFile(file, fileContents, 'utf8');
            }
        }),
    );
}

async function main() {
    const project = new Project({
        tsConfigFilePath: './tsconfig.lib.json',
    });

    console.info(`Loaded ${project.getSourceFiles().length} backend library files!`);

    project.forgetNodesCreatedInBlock(() => {
        convertClasses(project);
    });

    project.forgetNodesCreatedInBlock(() => {
        rewriteDtoImports(project);
    });

    generateIndexFiles(project);

    console.info('Writing library files...');
    const compilationResult = await project.emit();

    if (compilationResult.getDiagnostics().length) {
        console.warn('Compilation problems:');

        for (const diagnostic of compilationResult.getDiagnostics()) {
            console.warn(
                `[${diagnostic
                    .getSourceFile()
                    ?.getBaseName()}:${diagnostic.getLineNumber()}] ${diagnostic.getMessageText()}`,
            );
            console.log(diagnostic.getSourceFile()?.getFullText());
        }
    } else {
        console.info('Compilation succeeded without diagnostics/warnings');
    }

    console.info('Cleaning empty js files');
    await cleanJsFileImports();
}

main().catch((error) => {
    console.error(error);
});
