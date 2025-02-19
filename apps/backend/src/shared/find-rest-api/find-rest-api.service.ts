import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import type { EntityName, FilterQuery, FindAllOptions, Loaded, NoInfer, PopulatePath } from '@mikro-orm/core';
import { FindRestApiCountResponseDto } from './dto/find-rest-api-count-response.dto.js';
import type { FindRestApiCountDto } from './dto/find-rest-api-count.dto.js';

@Injectable()
export class FindRestApiService {
    constructor(private readonly em: EntityManager) {}

    public findAll<
        Entity extends object,
        Hint extends string = never,
        Fields extends string = PopulatePath.ALL,
        Excludes extends string = never,
    >(
        entityName: EntityName<Entity>,
        query: FindAllOptions<NoInfer<Entity>, Hint, Fields, Excludes>,
        additionalWhereQuery: FilterQuery<NoInfer<Entity>> = {},
    ): Promise<Loaded<Entity, Hint, Fields, Excludes>[]> {
        return this.em.fork().findAll(entityName, {
            ...query,
            where: { ...query.where, ...additionalWhereQuery },
        });
    }

    public findOne<
        Entity extends object,
        Hint extends string = never,
        Fields extends string = '*',
        Excludes extends string = never,
    >(
        entityName: EntityName<Entity>,
        idQuery: FilterQuery<NoInfer<Entity>>,
        query: FindAllOptions<Entity, Hint, Fields, Excludes>,
    ): Promise<Loaded<Entity, Hint, Fields, Excludes>>;
    public findOne<
        Entity extends object,
        Hint extends string = never,
        Fields extends string = '*',
        Excludes extends string = never,
    >(
        entityName: EntityName<Entity>,
        idQuery: FilterQuery<NoInfer<Entity>>,
        query: FindAllOptions<Entity, Hint, Fields, Excludes>,
        failOnNotFound: false,
    ): Promise<Loaded<Entity, Hint, Fields, Excludes> | null>;
    public findOne<
        Entity extends object,
        Hint extends string = never,
        Fields extends string = '*',
        Excludes extends string = never,
    >(
        entityName: EntityName<Entity>,
        idQuery: FilterQuery<NoInfer<Entity>>,
        query: FindAllOptions<Entity, Hint, Fields, Excludes>,
        failOnNotFound = true,
    ): Promise<Loaded<Entity, Hint, Fields, Excludes> | null> {
        return this.em
            .fork()
            [failOnNotFound ? 'findOneOrFail' : 'findOne'](entityName, { ...query.where, ...idQuery }, query);
    }

    public async count<Entity extends object, Hint extends string = never>(
        entityName: EntityName<Entity>,
        query: FindRestApiCountDto<Entity, Hint>,
        additionalWhereQuery: FilterQuery<NoInfer<Entity>> = {},
    ): Promise<FindRestApiCountResponseDto> {
        return {
            count: await this.em.fork().count(
                entityName,
                { ...query.where, ...additionalWhereQuery },
                {
                    ...query,
                },
            ),
        };
    }
}
