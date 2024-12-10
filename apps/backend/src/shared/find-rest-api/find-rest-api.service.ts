import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import type {
    CountOptions,
    EntityName,
    FilterQuery,
    FindAllOptions,
    FindOneOptions,
    Loaded,
    NoInfer,
    PopulatePath,
} from '@mikro-orm/core';

@Injectable()
export class FindRestApiService {
    constructor(private readonly em: EntityManager) {}

    public findMany<
        Entity extends object,
        Hint extends string = never,
        Fields extends string = PopulatePath.ALL,
        Excludes extends string = never,
    >(
        entityName: EntityName<Entity>,
        query: FindAllOptions<NoInfer<Entity>, Hint, Fields, Excludes>,
        additionalWhereQuery: FilterQuery<NoInfer<Entity>> = {},
    ): Promise<Loaded<Entity, Hint, Fields, Excludes>[]> {
        return this.em.findAll(entityName, {
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
        query: FindOneOptions<Entity, Hint, Fields, Excludes> & { where: FilterQuery<NoInfer<Entity>> },
    ): Promise<Loaded<Entity, Hint, Fields, Excludes>>;
    public findOne<
        Entity extends object,
        Hint extends string = never,
        Fields extends string = '*',
        Excludes extends string = never,
    >(
        entityName: EntityName<Entity>,
        idQuery: FilterQuery<NoInfer<Entity>>,
        query: FindOneOptions<Entity, Hint, Fields, Excludes> & { where: FilterQuery<NoInfer<Entity>> },
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
        query: FindOneOptions<Entity, Hint, Fields, Excludes> & { where: FilterQuery<NoInfer<Entity>> },
        failOnNotFound = true,
    ): Promise<Loaded<Entity, Hint, Fields, Excludes> | null> {
        return this.em[failOnNotFound ? 'findOneOrFail' : 'findOne'](entityName, { ...query.where, ...idQuery }, query);
    }

    public count<Entity extends object, Hint extends string = never>(
        entityName: EntityName<Entity>,
        query: CountOptions<Entity, Hint> & { where: FilterQuery<NoInfer<Entity>> },
        additionalWhereQuery: FilterQuery<NoInfer<Entity>> = {},
    ): Promise<number> {
        return this.em.count(
            entityName,
            { ...query.where, ...additionalWhereQuery },
            {
                ...query,
            },
        );
    }
}
