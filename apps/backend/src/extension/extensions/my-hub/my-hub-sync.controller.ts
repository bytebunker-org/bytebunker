import { Controller, Post, Query } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { EntityManager } from '@mikro-orm/postgresql';
import { MyHubSyncTriggerService, type MyHubSyncTriggerResult } from './my-hub-sync-trigger.service.js';

@Controller('my-hub')
export class MyHubSyncController {
    constructor(
        private readonly em: EntityManager,
        private readonly myHubSyncTriggerService: MyHubSyncTriggerService,
    ) {}

    @Post('sync')
    @ApiOperation({
        summary:
            'Run every blueprint with the my-hub sync trigger now (persons, calendars). With dryRun=true nothing is written.',
    })
    public sync(@Query('dryRun') dryRun?: string): Promise<MyHubSyncTriggerResult[]> {
        return this.em.transactional((em) =>
            this.myHubSyncTriggerService.trigger(em, { dryRun: dryRun === 'true' || dryRun === '1' }),
        );
    }
}
