import type { Collection } from '@mikro-orm/core';

export type DtoCollection<T extends object> = T[] | Collection<T>;
