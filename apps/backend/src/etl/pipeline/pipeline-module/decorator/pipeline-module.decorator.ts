import { applyDecorators, Injectable, SetMetadata } from '@nestjs/common';
import type { Constructable } from '../../../../util/type/constructable.interface.js';
import type { PipelineModuleTypeEnum } from '../type/pipeline-module-type.enum.js';

export interface PipelineModuleOptions<Input, Output> {
    extensionName: string;

    version?: number;

    type?: PipelineModuleTypeEnum;

    inputType?: Constructable<Input>;

    outputType?: Constructable<Output>;

    /**
     * Share of the whole pipeline's progress this module accounts for, relative to the other nodes (default 1,
     * trigger modules 0). Heavy modules such as store-activity use a higher weight so the pipeline progress bar
     * moves with the actual work.
     */
    progressWeight?: number;
}

export const PIPELINE_MODULE_METADATA = 'pipeline-module-metadata';

export const PipelineModule = <Input, Output>(options: PipelineModuleOptions<Input, Output>) =>
    applyDecorators(SetMetadata(PIPELINE_MODULE_METADATA, options), Injectable());
