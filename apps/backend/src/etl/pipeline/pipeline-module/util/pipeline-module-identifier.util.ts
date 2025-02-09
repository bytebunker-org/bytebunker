import {
    PIPELINE_MODULE_IDENTIFIER_REGEX,
    PIPELINE_MODULE_IDENTIFIER_VERSION_OPTIONAL_REGEX,
} from '../pipeline-module.constant.js';
import type {
    DeconstructedPipelineModuleIdentifier,
    PipelineModuleIdentifier,
} from '../type/pipeline-module-identifier.type.js';

export function buildModuleIdentifier(
    extensionName: string,
    moduleName: string,
    moduleVersion: number,
): PipelineModuleIdentifier {
    return `${extensionName.toLowerCase()}:${moduleName}@${moduleVersion}`;
}

export function validatePipelineModuleIdentifier(identifier: string): identifier is PipelineModuleIdentifier {
    return PIPELINE_MODULE_IDENTIFIER_REGEX.test(identifier);
}

export function deconstructPipelineModuleIdentifier(
    identifier: PipelineModuleIdentifier,
    versionOptional = false,
): DeconstructedPipelineModuleIdentifier {
    const match = (
        versionOptional ? PIPELINE_MODULE_IDENTIFIER_VERSION_OPTIONAL_REGEX : PIPELINE_MODULE_IDENTIFIER_REGEX
    ).exec(identifier);

    if (!match) {
        throw new Error(`Invalid module identifier ${identifier}`);
    }

    return {
        extensionName: match[1],
        moduleName: match[2],
        moduleVersion: Number.parseInt(match[3] ?? '1'),
    };
}
