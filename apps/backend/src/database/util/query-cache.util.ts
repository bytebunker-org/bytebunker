import { hashStableKey, type StableKey } from '../../util/stable-key-hash.util.js';
import type { BaseEntity } from '@mikro-orm/core';
import type { Constructable } from '../../util/type/constructable.interface.js';

export type QueryCache = [string, number];

export function cacheQuery(entity: Constructable<BaseEntity>, cacheKey?: StableKey, timeCached = 1000): QueryCache {
    return [hashStableKey([entity.name, ...(cacheKey ?? [])]), timeCached];
}
