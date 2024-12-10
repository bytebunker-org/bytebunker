import type { PopulatePath } from '@mikro-orm/core';
import { FindAllDto } from './find-all.dto.js';

export class FindOneDto<
    Entity,
    Hint extends string = never,
    Fields extends string = PopulatePath.ALL,
    Excludes extends string = never,
> extends FindAllDto<Entity, Hint, Fields, Excludes> {}
