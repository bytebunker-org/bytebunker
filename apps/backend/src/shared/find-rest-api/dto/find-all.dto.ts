import { Allow, IsBoolean, IsInt, IsObject, IsOptional, IsPositive, Min } from 'class-validator';
import type {
    AutoPath,
    FilterObject,
    FindOptions,
    ObjectQuery,
    OrderDefinition,
    Populate,
    PopulateHint,
    PopulatePath,
} from '@mikro-orm/core';

export class FindAllDto<
    Entity,
    Hint extends string = never,
    Fields extends string = PopulatePath.ALL,
    Excludes extends string = never,
> implements FindOptions<Entity, Hint, Fields, Excludes>
{
    @IsOptional()
    @Allow()
    public populate?: Populate<Entity, Hint>;

    @IsOptional()
    @Allow()
    public fields?: readonly AutoPath<Entity, Fields, `${PopulatePath.ALL}`>[];

    @IsOptional()
    @Allow()
    public exclude?: readonly AutoPath<Entity, Excludes>[];

    /**
     * Where condition for populated relations. This will have no effect on the root entity.
     * With `select-in` strategy, this is applied only to the populate queries.
     * With `joined` strategy, those are applied as `join on` conditions.
     * When you use a nested condition on a to-many relation, it will produce a nested inner join,
     * discarding the collection items based on the child condition.
     */
    @IsOptional()
    @Allow()
    public populateWhere?: ObjectQuery<Entity> | PopulateHint | `${PopulateHint}`;

    /**
     * Filter condition for populated relations. This is similar to `populateWhere`, but will produce a `left join`
     * when nesting the condition. This is used for implementation of joined filters.
     */
    @IsOptional()
    @IsObject()
    public populateFilter?: ObjectQuery<Entity>;

    /** Used for ordering of the populate queries. If not specified, the value of `options.orderBy` is used. */
    @IsOptional()
    @IsObject()
    public populateOrderBy?: OrderDefinition<Entity>;

    /** Ordering of the results.Can be an object or array of objects, keys are property names, values are ordering (asc/desc) */
    @IsOptional()
    @IsObject()
    public orderBy?: OrderDefinition<Entity>;

    /** Control result caching for this query. Result cache is by default disabled, not to be confused with the identity map. */
    @IsOptional()
    @Allow()
    public cache?: boolean | number | [string, number];

    /**
     * Limit the number of returned results. If you try to use limit/offset on a query that joins a to-many relation, pagination mechanism
     * will be triggered, resulting in a subquery condition, to apply this limit only to the root entities
     * instead of the cartesian product you get from a database in this case.
     */
    @IsOptional()
    @IsInt()
    @IsPositive()
    public limit?: number;

    /**
     * Sets the offset. If you try to use limit/offset on a query that joins a to-many relation, pagination mechanism
     * will be triggered, resulting in a subquery condition, to apply this limit only to the root entities
     * instead of the cartesian product you get from a database in this case.
     */
    @IsOptional()
    @IsInt()
    @Min(0)
    public offset?: number;

    /** Fetch items `before` this cursor. */
    @IsOptional()
    @Allow()
    public before?:
        | string
        | {
              startCursor: string | null;
          }
        | FilterObject<Entity>;

    /** Fetch items `after` this cursor. */
    @IsOptional()
    @Allow()
    public after?:
        | string
        | {
              endCursor: string | null;
          }
        | FilterObject<Entity>;

    /** Fetch `first` N items. */
    @IsOptional()
    @IsInt()
    @IsPositive()
    public first?: number;

    /** Fetch `last` N items. */
    @IsOptional()
    @IsInt()
    @Min(0)
    public last?: number;

    /** Fetch one more item than `first`/`last`, enabled automatically in `em.findByCursor` to check if there is a next page. */
    @IsOptional()
    @IsBoolean()
    public overfetch?: boolean;

    @IsOptional()
    @IsBoolean()
    public refresh?: boolean;
}
