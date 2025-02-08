import { QueueNameEnum } from './queue-name.enum.js';
import type { Constructable } from '../util/type/constructable.interface.js';
import { PipelineExecutionJobDataDto } from './dto/pipeline-execution-job-data.dto.js';
import { PipelineSingleModuleExecutionJobDataDto } from './dto/pipeline-single-module-execution-job-data.dto.js';

export const queueJobDataMap = {
    [QueueNameEnum.PIPELINE_EXECUTION]: PipelineExecutionJobDataDto,
    [QueueNameEnum.PIPELINE_SINGLE_MODULE_EXECUTION]: PipelineSingleModuleExecutionJobDataDto,
} satisfies Record<QueueNameEnum, Constructable>;

export const queueJobReturnDataMap = {} satisfies Partial<Record<QueueNameEnum, Constructable>>;
