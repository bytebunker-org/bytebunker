import { Controller, Get, Query } from '@nestjs/common';
import { ActivityGraphSearchService } from './activity-graph-search.service.js';
import { ActivityGraphSearchRequestDto } from './dto/activity-graph-search-request.dto.js';
import type { ActivityGraphSearchResponseDto } from './dto/activity-graph-search-response.dto.js';
import { EntityManager } from '@mikro-orm/postgresql';
import type { ActivityGraphSearchCountRequestDto } from './dto/activity-graph-search-count-request.dto.js';
import type { ActivityGraphSearchCountResponseDto } from './dto/activity-graph-search-count-response.dto.js';

@Controller('activities/search')
export class ActivityGraphSearchController {
    constructor(
        private readonly activityGraphSearchService: ActivityGraphSearchService,
        private readonly em: EntityManager,
    ) {}

    @Get()
    public search(@Query() data: ActivityGraphSearchRequestDto): Promise<ActivityGraphSearchResponseDto> {
        return this.em.transactional((em) => this.activityGraphSearchService.search(em, data));
    }

    @Get('count')
    public count(@Query() data: ActivityGraphSearchCountRequestDto): Promise<ActivityGraphSearchCountResponseDto> {
        return this.em.transactional((em) => this.activityGraphSearchService.count(em, data));
    }
}
