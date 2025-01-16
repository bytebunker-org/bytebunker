import { PIPELINE_MODULE_IDENTIFIER_LENGTH } from '../pipeline-module/pipeline-module.constant.js';

/**
 * Represents a module identifier.
 * The max length of an extension name and module name is 64 characters.
 * The max length of a module version is 5 characters (max value is 65535).
 * With the `:` and `@` characters, the total length is 135 characters.
 *
 * @example `my-extension:my-module@1`
 */
export type PipelineModuleIdentifier<
    ExtensionName extends string = string,
    ModuleName extends string = string,
    ModuleVersion extends string = string,
> = `${ExtensionName}:${ModuleName}@${ModuleVersion}`;

export function buildModuleIdentifier(
    extensionName: string,
    moduleName: string,
    moduleVersion: number,
): PipelineModuleIdentifier {
    return `${extensionName.toLowerCase()}:${moduleName.toLowerCase()}@${moduleVersion}`;
}

const pipelineModuleIdentifierRegex = /^[\w-]+:[\w-]+@\d+$/;

export function validatePipelineModuleIdentifier(identifier: string): identifier is PipelineModuleIdentifier {
    return identifier.length <= PIPELINE_MODULE_IDENTIFIER_LENGTH && pipelineModuleIdentifierRegex.test(identifier);
}

export function deconstructPipelineModuleIdentifier(identifier: PipelineModuleIdentifier): {
    extensionName: string;
    moduleName: string;
    moduleVersion: number;
} {
    if (!validatePipelineModuleIdentifier(identifier)) {
        throw new Error('Invalid module identifier');
    }

    return {
        extensionName: identifier.slice(0, Math.max(0, identifier.indexOf(':'))),
        moduleName: identifier.slice(identifier.indexOf(':') + 1, identifier.indexOf('@')),
        moduleVersion: Number.parseInt(identifier.slice(identifier.indexOf('@') + 1)),
    };
}
