import { Allow, IsObject, IsOptional } from 'class-validator';
import type { FilterQuery, CountOptions } from '@mikro-orm/core';

export class FindRestApiCountDto<Entity extends object, Hint extends string = never>
    implements CountOptions<Entity, Hint>
{
    @IsOptional()
    @IsObject()
    public where?: FilterQuery<Entity>;

    /** Control result caching for this query. Result cache is by default disabled, not to be confused with the identity map. */
    @IsOptional()
    @Allow()
    public cache?: boolean | number | [string, number];
}
