import type { Collection, Ref } from '@mikro-orm/core';
type ExcludedEntityPropertyNames<T> = {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
    [K in keyof T]: T[K] extends Function
        ? never
        : T[K] extends Ref<any>
          ? never
          : T[K] extends Collection<any>
            ? never
            : K;
}[keyof T];

export type NonFunctionProperties<T> = Pick<T, ExcludedEntityPropertyNames<T>>;
export type EntityProperties<
    T,
    OptionalProperties extends keyof T = never,
    ExcludedProperties extends keyof T = never,
> = Omit<
    Omit<NonFunctionProperties<T>, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | ExcludedProperties>,
    OptionalProperties
> &
    Partial<Pick<T, OptionalProperties>>;
