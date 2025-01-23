import type { ExportDeclarationStructure, OptionalKind } from 'ts-morph';
import { Project, StructureKind } from 'ts-morph';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { glob } from 'glob';

const currentDirname = path.dirname(fileURLToPath(import.meta.url));
const libraryDirectory = path.resolve(currentDirname, '../../lib');

const mappedTypeClassNames = new Set(['PickType', 'OmitType', 'PartialType', 'IntersectionType']);

function rewriteDtoMappedTypes(project: Project) {
    const dtoFiles = project.getSourceFiles('src/**/*.dto.ts');

    console.info(`Processing ${dtoFiles.length} dto files...`);

    const mappedTypesIndexFile = project.getSourceFile('src/util/generated-library-mapped-types/index.ts');

    if (!mappedTypesIndexFile) {
        throw new Error('Replacement mapped types index file not found');
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
            const mappedTypeImports: string[] = [];
            const removedStatements: any[] = [];

            for (const statement of structure.statements) {
                if (typeof statement === 'object' && statement.kind === StructureKind.ImportDeclaration) {
                    const isMappedTypeImport =
                        statement.moduleSpecifier === '@nestjs/swagger' ||
                        statement.moduleSpecifier === '@nestjs/mapped-types';

                    if (isMappedTypeImport && Array.isArray(statement.namedImports)) {
                        statement.namedImports = statement.namedImports.filter((namedImport) => {
                            if (typeof namedImport === 'object' && mappedTypeClassNames.has(namedImport.name)) {
                                mappedTypeImports.push(namedImport.name);

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

            if (mappedTypeImports.length) {
                structure.statements.unshift({
                    kind: StructureKind.ImportDeclaration,
                    namedImports: mappedTypeImports,
                    moduleSpecifier: dtoFile.getRelativePathAsModuleSpecifierTo(mappedTypesIndexFile) + '.js',
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
    const exportedFiles = project.getSourceFiles();

    console.info(`Generating index file containing re-exports from ${exportedFiles.length} files...`);

    const indexFile = project.createSourceFile('src/index.ts');

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
        rewriteDtoMappedTypes(project);
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
