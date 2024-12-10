// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
type NonFunctionPropertyNames<T> = { [K in keyof T]: T[K] extends Function ? never : K }[keyof T];
export type NonFunctionProperties<T> = Pick<T, NonFunctionPropertyNames<T>>;
export type EntityProperties<
    T,
    OptionalProperties extends keyof T = never,
    ExcludedProperties extends keyof T = never,
> = Omit<
    Omit<NonFunctionProperties<T>, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | ExcludedProperties>,
    OptionalProperties
> &
    Partial<Pick<T, OptionalProperties>>;
