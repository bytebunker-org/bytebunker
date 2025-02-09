import type { PipeTransform } from '@nestjs/common/interfaces/features/pipe-transform.interface.js';
import type { PipelineModuleIdentifier } from '../type/pipeline-module-identifier.type.js';
import { validatePipelineModuleIdentifier } from './pipeline-module-identifier.util.js';
import { BadRequestError } from '../../../../util/rest-error.js';
import { Injectable, Optional } from '@nestjs/common';

export interface ParsePipelineModuleIdentifierPipeOptions {
    /**
     * If true, the pipe will return null or undefined if the value is not provided
     * @default false
     */
    optional?: boolean;
}

@Injectable()
export class ParsePipelineModuleIdentifierPipe
    implements PipeTransform<string | undefined, PipelineModuleIdentifier | undefined>
{
    constructor(@Optional() protected readonly options: ParsePipelineModuleIdentifierPipeOptions = {}) {}

    public transform(value: string | undefined): PipelineModuleIdentifier | undefined {
        if (!value && this.options.optional) {
            return value as undefined;
        }

        if (value && validatePipelineModuleIdentifier(value)) {
            return value;
        }

        throw new BadRequestError('Validation failed (pipeline module identifier is expected)');
    }
}
