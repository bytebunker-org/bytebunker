import type { QueueNameEnum } from './queue-name.enum.js';
import type { queueJobDataMap } from './queue-job-data-map.constant.js';
import type { Worker } from 'bullmq';

export type JobDataType<JobName extends QueueNameEnum> = InstanceType<(typeof queueJobDataMap)[JobName]>;
// Enable when there actually is return data for some job
// type JobReturnDataType<JobName extends QueueNameEnum> = (typeof queueJobReturnDataMap)[JobName];
export type JobReturnDataType<JobName extends QueueNameEnum> = void;
export type WorkerType<JobName extends QueueNameEnum> = Worker<JobDataType<JobName>, JobReturnDataType<JobName>>;
