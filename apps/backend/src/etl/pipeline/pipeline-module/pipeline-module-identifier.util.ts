import { PIPELINE_MODULE_IDENTIFIER_REGEX } from './pipeline-module.constant.js';
import type {
    DeconstructedPipelineModuleIdentifier,
    PipelineModuleIdentifier,
} from './type/pipeline-module-identifier.type.js';

export function buildModuleIdentifier(
    extensionName: string,
    moduleName: string,
    moduleVersion: number,
): PipelineModuleIdentifier {
    return `${extensionName.toLowerCase()}:${moduleName.toLowerCase()}@${moduleVersion}`;
}

export function validatePipelineModuleIdentifier(identifier: string): identifier is PipelineModuleIdentifier {
    return PIPELINE_MODULE_IDENTIFIER_REGEX.test(identifier);
}

export function deconstructPipelineModuleIdentifier(
    identifier: PipelineModuleIdentifier,
): DeconstructedPipelineModuleIdentifier {
    const match = PIPELINE_MODULE_IDENTIFIER_REGEX.exec(identifier);
    if (!match) {
        throw new Error('Invalid module identifier');
    }

    return {
        extensionName: match[1],
        moduleName: match[2],
        moduleVersion: Number.parseInt(match[3]),
    };
}
