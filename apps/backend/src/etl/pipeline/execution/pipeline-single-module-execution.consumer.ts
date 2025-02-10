import { Processor } from '@nestjs/bullmq';
import { AbstractQueueConsumer, type QueueConsumerJob } from '../../../queue/abstract-queue-consumer.class.js';
import { QueueNameEnum } from '../../../queue/queue-name.enum.js';
import { PipelineExecutionService } from './pipeline-execution.service.js';
import { EntityManager } from '@mikro-orm/postgresql';

@Processor(QueueNameEnum.PIPELINE_SINGLE_MODULE_EXECUTION)
export class PipelineSingleModuleExecutionConsumer extends AbstractQueueConsumer<QueueNameEnum.PIPELINE_SINGLE_MODULE_EXECUTION> {
    constructor(
        private readonly em: EntityManager,
        private readonly pipelineExecutionService: PipelineExecutionService,
    ) {
        super();
    }

    public override process(job: QueueConsumerJob<QueueNameEnum.PIPELINE_SINGLE_MODULE_EXECUTION>): Promise<void> {
        console.log('PipelineSingleModuleExecutionConsumer processing', job.name, job.data);
        return this.em.transactional(async (em) => {
            try {
                const { pipelineId, nodeId } = job.data;

                // TODO: Also give executeModule the job instance to track granular progress
                await this.pipelineExecutionService.executeModule(em, pipelineId, nodeId);
            } catch (error) {
                console.error(error);
                throw error;
            }
        });
    }
}
