import { Processor } from '@nestjs/bullmq';
import { AbstractQueueConsumer, type QueueConsumerJob } from '../../../queue/abstract-queue-consumer.class.js';
import { QueueNameEnum } from '../../../queue/queue-name.enum.js';
import { PipelineExecutionService } from './pipeline-execution.service.js';
import { EntityManager } from '@mikro-orm/postgresql';

@Processor(QueueNameEnum.PIPELINE_EXECUTION)
export class PipelineExecutionConsumer extends AbstractQueueConsumer<QueueNameEnum.PIPELINE_EXECUTION> {
    constructor(
        private readonly pipelineExecutionService: PipelineExecutionService,
        private readonly em: EntityManager,
    ) {
        super();
    }

    public override process(job: QueueConsumerJob<QueueNameEnum.PIPELINE_EXECUTION>): Promise<void> {
        console.log('PipelineExecutionConsumer processing', job);
        return this.em.transactional((em) =>
            this.pipelineExecutionService.continuePipelineExecution(em, job.data.pipelineId),
        );
    }
}
