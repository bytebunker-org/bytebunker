import type { Ref } from '@mikro-orm/core';

export type DtoRef<T extends object> = T | Ref<T>;
