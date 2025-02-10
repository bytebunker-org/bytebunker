import { Processor } from '@nestjs/bullmq';
import { AbstractQueueConsumer, type QueueConsumerJob } from '../../../queue/abstract-queue-consumer.class.js';
import { QueueNameEnum } from '../../../queue/queue-name.enum.js';
import { PipelineExecutionService } from './pipeline-execution.service.js';
import { EntityManager } from '@mikro-orm/postgresql';

@Processor(QueueNameEnum.START_PIPELINE_EXECUTION)
export class StartPipelineExecutionConsumer extends AbstractQueueConsumer<QueueNameEnum.START_PIPELINE_EXECUTION> {
    constructor(
        private readonly pipelineExecutionService: PipelineExecutionService,
        private readonly em: EntityManager,
    ) {
        super();
    }

    public override process(job: QueueConsumerJob<QueueNameEnum.START_PIPELINE_EXECUTION>): Promise<void> {
        console.log('StartPipelineExecutionConsumer processing', job.name, job.data);
        return this.em.transactional(async (em) => {
            try {
                await this.pipelineExecutionService.continuePipelineExecution(em, job.data.pipelineId);
            } catch (error) {
                console.error(error);
                throw error;
            }
        });
    }
}
