import { WorkerHost } from '@nestjs/bullmq';
import { type Job } from 'bullmq';
import type { QueueNameEnum } from './queue-name.enum.js';
import type { JobDataType, JobReturnDataType, WorkerType } from './queue-data.type.js';

export type QueueConsumerJob<JobName extends QueueNameEnum> = Job<
    JobDataType<JobName>,
    JobReturnDataType<JobName>,
    JobName
>;

export abstract class AbstractQueueConsumer<JobName extends QueueNameEnum> extends WorkerHost<WorkerType<JobName>> {
    override get worker(): WorkerType<JobName> {
        return super.worker;
    }

    abstract override process(job: QueueConsumerJob<JobName>, token?: string): Promise<JobReturnDataType<JobName>>;
}
