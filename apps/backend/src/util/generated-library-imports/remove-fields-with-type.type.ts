type KeysWithType<T, Type> = {
    [K in keyof T]: T[K] extends Type ? K : never;
}[keyof T];

/**
 * @deprecated Don't use this in dto code! Always import from @nestjs/mapped-types or @nestjs/swagger. These classes are only used when exporting the browser compatible library
 */
export type RemoveFieldsWithType<T, Type> = Exclude<T, KeysWithType<T, Type>>;
