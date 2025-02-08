import { Module } from '@nestjs/common';
import { BullModule, type RegisterFlowProducerOptions, type RegisterQueueOptions } from '@nestjs/bullmq';
import { RedisModule } from '../shared/redis/redis.module.js';
import { REDIS_PROVIDER } from '../shared/redis/redis.constant.js';
import type { Redis } from 'ioredis';
import type { QueueOptions } from 'bullmq';
import { BullBoardModule, type BullBoardQueueOptions } from '@bull-board/nestjs';
import { ExpressAdapter as BullBoardExpressAdapter } from '@bull-board/express';
import { enumValues } from '../util/util.js';
import { QueueNameEnum } from './queue-name.enum.js';
import { QueueFlowNameEnum } from './queue-flow-name.enum.js';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter.js';

@Module({
    imports: [
        BullModule.forRootAsync({
            imports: [RedisModule],
            inject: [REDIS_PROVIDER],
            useFactory: (redis: Redis) =>
                ({
                    connection: redis,
                }) satisfies QueueOptions,
        }),
        BullModule.registerQueue(...enumValues(QueueNameEnum).map((name) => ({ name }) satisfies RegisterQueueOptions)),
        BullModule.registerFlowProducer(
            ...enumValues(QueueFlowNameEnum).map((name) => ({ name }) satisfies RegisterFlowProducerOptions),
        ),
        // TODO: Access controls? But this application shouldn't be accessible from the outside anyway
        BullBoardModule.forRoot({
            route: '/queues',
            adapter: BullBoardExpressAdapter,
        }),
        BullBoardModule.forFeature(
            ...enumValues(QueueNameEnum).map(
                (name) =>
                    ({
                        name,
                        adapter: BullMQAdapter,
                    }) satisfies BullBoardQueueOptions,
            ),
        ),
    ],
    exports: [BullModule],
})
export class QueueModule {}
