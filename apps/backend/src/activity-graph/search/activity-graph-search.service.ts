import { Inject, Injectable } from '@nestjs/common';
import type { ActivityGraphSearchResponseDto } from './dto/activity-graph-search-response.dto.js';
import { Neode, RelationshipDirectionEnum } from '@bytebunker/neode';
import { type Builder, OrderDirectionEnum, QueryMode } from '@bytebunker/neode/query';
import { NEODE_PROVIDER } from '../graph-database/neode.constant.js';
import type { ActivityGraphSearchRequestDto } from './dto/activity-graph-search-request.dto.js';
import { NodeLabelEnum } from '../node-label.enum.js';
import { ActivityGraphService } from '../activity-graph.service.js';
import type { EntityManager } from '@mikro-orm/postgresql';
import { RelationshipLabelEnum } from '../relationship-label.enum.js';
import { BadRequestError } from '../../util/rest-error.js';
import type { QueryResult } from 'neo4j-driver-core';
import { hydrateGraph, type JsonTreeRecordShape } from './activity-graph-hydration.util.js';
import type { ASActivity } from '@bytebunker/event-schema';
import { DateTime } from 'luxon';
import type { ActivityGraphSearchCountResponseDto } from './dto/activity-graph-search-count-response.dto.js';
import { Integer, isDate } from 'neo4j-driver';

const cursorPageSize = 100;
const maxActivityRelationshipExpansionDepth = 3;

const dt = (dateTime: DateTime | undefined) =>
    dateTime
        ? dateTime.toLocaleString(DateTime.DATE_SHORT) + '; ' + dateTime.toLocaleString(DateTime.TIME_24_SIMPLE)
        : 'undefined dt';

interface ExecuteSearchReturnType {
    activityNodes: ASActivity[];
    firstEntryDateTime: DateTime | undefined;
    lastEntryDateTime: DateTime | undefined;
}

@Injectable()
export class ActivityGraphSearchService {
    constructor(
        @Inject(NEODE_PROVIDER) private readonly neode: Neode,
        private readonly activityGraphService: ActivityGraphService,
    ) {}

    public async count(
        em: EntityManager,
        data: ActivityGraphSearchRequestDto,
    ): Promise<ActivityGraphSearchCountResponseDto> {
        const builder = await this.prepareActivityQuery(em, data);
        const result = (await builder
            .with('date(datetime(activity.startTime)) AS activityDate')
            .return('activityDate.year, activityDate.month, COUNT(*) AS activityCount')
            .orderBy('activityDate.year DESC, activityDate.month', OrderDirectionEnum.DESC)
            .execute(QueryMode.READ)) as unknown as QueryResult<{
            'activityDate.year': Integer;
            'activityDate.month': Integer;
            activityCount: number;
        }>;

        return {
            groupedCount: result.records.map((r) => {
                const year = r.get('activityDate.year');
                const month = r.get('activityDate.month');

                //if (!isDate(rawDate)) {
                //throw new Error(`Date ${rawDate} is not valid`);
                //}

                return {
                    date: DateTime.fromObject({
                        year: year.toInt(),
                        month: month.toInt(),
                    }).toISODate()!,
                    count: Integer.fromValue(r.get('activityCount')).toInt(),
                } satisfies { date: string; count: number };
            }),
        };
    }

    public async search(
        em: EntityManager,
        data: ActivityGraphSearchRequestDto,
    ): Promise<ActivityGraphSearchResponseDto> {
        if (!data.cursorStart && !data.cursorEnd) {
            throw new BadRequestError('Missing at least one of cursorStart or cursorEnd');
        }

        const isFullDateRange = Boolean(data.cursorStart && data.cursorEnd);

        const { activityNodes, firstEntryDateTime, lastEntryDateTime } = await this.executeSearch(
            em,
            data,
            data.cursorStart,
            data.cursorEnd,
        );

        // Fill in the start of the day when we have an end cursor or the end of the day when we have a start cursor
        let dayStartFillerRequest: Promise<ExecuteSearchReturnType> | undefined;
        let dayEndFillerRequest: Promise<ExecuteSearchReturnType> | undefined;

        if (!isFullDateRange) {
            if (data.cursorStart && lastEntryDateTime) {
                dayEndFillerRequest = this.executeSearch(em, data, lastEntryDateTime, lastEntryDateTime.startOf('day'));
            }
            if (data.cursorEnd && firstEntryDateTime) {
                dayStartFillerRequest = this.executeSearch(
                    em,
                    data,
                    firstEntryDateTime.endOf('day'),
                    firstEntryDateTime,
                );
            }
        }

        const [dayStartFillerResult, dayEndFillerResult] = await Promise.all([
            dayStartFillerRequest,
            dayEndFillerRequest,
        ]);

        // TODO: Change lastEntryDateTime to actually fetched last entry
        const timeRangeStart = isFullDateRange
            ? data.cursorStart!
            : (data.cursorStart?.startOf('day') ?? dayStartFillerResult?.firstEntryDateTime ?? firstEntryDateTime);
        const timeRangeEnd = isFullDateRange
            ? data.cursorEnd!
            : (data.cursorEnd?.endOf('day') ?? dayEndFillerResult?.lastEntryDateTime ?? lastEntryDateTime);

        const { hasPreviousPage, hasNextPage } = await this.existsActivityOutsideTimeRange(
            em,
            data,
            timeRangeStart,
            timeRangeEnd,
        );

        const filledActivityNodes = [
            ...(dayStartFillerResult?.activityNodes ?? []),
            ...activityNodes,
            ...(dayEndFillerResult?.activityNodes ?? []),
        ];

        console.log('SEARCH', {
            cursorStart: data.cursorStart,
            cursorEnd: data.cursorEnd,
            timeRangeStart,
            timeRangeEnd,
            hasPreviousPage,
            hasNextPage,
        });

        return {
            activities: filledActivityNodes,
            cursorType: data.cursorStart ? 'startCursor' : 'endCursor',
            previousPageEndCursor: timeRangeStart,
            currentPageCursor: data.cursorStart ?? data.cursorEnd!,
            nextPageStartCursor: timeRangeEnd,
            hasPreviousPage,
            hasNextPage,
        };
    }

    private async existsActivityOutsideTimeRange(
        em: EntityManager,
        data: ActivityGraphSearchRequestDto,
        startDateTime: DateTime | undefined,
        endDateTime: DateTime | undefined,
    ): Promise<{ hasPreviousPage: boolean; hasNextPage: boolean }> {
        const buildActivityExistsQuery = (searchQuery: string) => `
            RETURN EXISTS {
                ${searchQuery}
            } AS activityExists
        `;

        type Query = { query: string; params: Record<string, unknown> };
        let hasPreviousSubquery: Query | undefined;
        let hasNextSubquery: Query | undefined;

        if (startDateTime) {
            const hasPreviousBuilder = await this.prepareActivityQuery(em, data);
            hasPreviousBuilder.whereRaw(`activity.startTime > '${startDateTime.toISO()}'`);
            hasPreviousSubquery = hasPreviousBuilder.build();
        }

        if (endDateTime) {
            const hasNextBuilder = await this.prepareActivityQuery(em, data);
            hasNextBuilder.whereRaw(`activity.startTime < '${endDateTime.toISO()}'`);
            hasNextSubquery = hasNextBuilder.build();
        }

        const [hasPreviousResult, hasNextResult] = await Promise.all([
            hasPreviousSubquery
                ? this.neode.readCypher<{ activityExists: boolean }>(
                      buildActivityExistsQuery(hasPreviousSubquery.query),
                      hasPreviousSubquery.params,
                  )
                : undefined,
            hasNextSubquery
                ? this.neode.readCypher<{ activityExists: boolean }>(
                      buildActivityExistsQuery(hasNextSubquery.query),
                      hasNextSubquery.params,
                  )
                : undefined,
        ]);

        return {
            hasPreviousPage: hasPreviousResult?.records[0].get('activityExists') ?? false,
            hasNextPage: hasNextResult?.records[0].get('activityExists') ?? false,
        };
    }

    private async executeSearch(
        em: EntityManager,
        data: ActivityGraphSearchRequestDto,
        startDateTime: DateTime | undefined,
        endDateTime: DateTime | undefined,
    ): Promise<ExecuteSearchReturnType> {
        const builder = await this.prepareActivityQuery(em, data);

        const orderDirection = endDateTime && !startDateTime ? OrderDirectionEnum.ASC : OrderDirectionEnum.DESC;
        this.applyCursorToQuery(builder, startDateTime, endDateTime, orderDirection);

        const { query, params } = builder.build();

        const expandedActivityObjectsQuery = `
            ${query}
            CALL apoc.path.expandConfig(
              activity,
              {
                maxLevel: ${maxActivityRelationshipExpansionDepth},
                relationshipFilter: '>',
                labelFilter: '-Extension'
              }
            ) YIELD path
            
            WITH activity, collect(path) AS paths
            CALL apoc.paths.toJsonTree(paths, false) YIELD value AS activityTree
            
            RETURN activityTree
        `;

        const result = await this.neode.readCypher<JsonTreeRecordShape>(expandedActivityObjectsQuery, params);

        const activityNodes = hydrateGraph(
            this.neode,
            result as unknown as QueryResult<JsonTreeRecordShape>,
        ) as ASActivity[];

        // Reverse graph again (because we reverse the sorting direction if endTime is set in applyCursorToQuery)
        if (orderDirection === OrderDirectionEnum.ASC) {
            activityNodes.reverse();
        }

        const firstEntryDateTimeString = activityNodes.at(0)?.startTime as unknown as string;
        const firstEntryDateTime = firstEntryDateTimeString ? DateTime.fromISO(firstEntryDateTimeString) : undefined;

        const lastEntryDateTimeString = activityNodes.at(-1)?.startTime as unknown as string;
        const lastEntryDateTime = lastEntryDateTimeString ? DateTime.fromISO(lastEntryDateTimeString) : undefined;

        return {
            activityNodes,
            firstEntryDateTime,
            lastEntryDateTime,
        };
    }

    private async prepareActivityQuery(em: EntityManager, data: ActivityGraphSearchRequestDto): Promise<Builder> {
        const ownerActor = await this.activityGraphService.getOwnerActor(em);

        const builder = this.neode.query();
        builder.match('ownerActor', NodeLabelEnum.PERSON, { id: ownerActor.get('id')! });
        builder
            .match('ownerActor')
            .relationship(RelationshipLabelEnum.ACTED_IN, RelationshipDirectionEnum.OUT)
            .to('activity');

        if (data.activityTypes) {
            builder.whereRaw(`activity:${data.activityTypes.join(':')}`);
        }

        return builder;
    }

    private applyCursorToQuery(
        builder: Builder,
        startDateTime: DateTime | undefined,
        endDateTime: DateTime | undefined,
        orderDirection: OrderDirectionEnum,
    ): void {
        if (startDateTime) {
            builder.whereRaw(`activity.startTime < '${startDateTime.toISO()}'`);
        }
        if (endDateTime) {
            builder.whereRaw(`activity.startTime > '${endDateTime.toISO()}'`);
        }

        builder.orderBy('activity.startTime', orderDirection);
        builder.limit(cursorPageSize);
    }
}
