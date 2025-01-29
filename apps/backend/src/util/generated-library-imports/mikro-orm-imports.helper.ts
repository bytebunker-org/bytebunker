/**
 * @deprecated Don't use this in dto code! Always import from @mikro-orm/core. These classes are only used when exporting the browser compatible library
 */
export type DtoCollection<T extends object> = T[];

/**
 * @deprecated Don't use this in dto code! Always import from @mikro-orm/core. These classes are only used when exporting the browser compatible library
 */
export type DtoRef<T extends object> = T;

export type Opt<T = unknown> = T;

/**
 * @deprecated Don't use this in dto code! Always import from @mikro-orm/core. These classes are only used when exporting the browser compatible library
 */
export const PrimaryKeyProp = Symbol('DTOPrimaryKeyProp');

/**
 * @deprecated Don't use this in dto code! Always import from @mikro-orm/core. These classes are only used when exporting the browser compatible library
 */
export enum PopulatePath {
    INFER = '$infer',
    ALL = '*',
}

/**
 * @deprecated Don't use this in dto code! Always import from @mikro-orm/core. These classes are only used when exporting the browser compatible library
 */
export enum PopulateHint {
    INFER = 'infer',
    ALL = 'all',
}
type IsAny<T> = 0 extends 1 & T ? true : false;
type Scalar =
    | boolean
    | number
    | string
    | bigint
    | symbol
    | Date
    | RegExp
    | Uint8Array
    | {
          toHexString(): string;
      };
type Prev = [never, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
type Loadable<T extends object> = DtoCollection<T> | DtoRef<T> | readonly T[];
type ExtractType<T> = T extends Loadable<infer U> ? U : T;
type InternalKeys =
    | 'EntityRepositoryType'
    | 'PrimaryKeyProp'
    | 'OptionalProps'
    | 'EagerProps'
    | 'HiddenProps'
    | '__selectedType'
    | '__loadedType';
type CleanKeys<T, K extends keyof T, B extends boolean = false> = T[K] & {} extends Function
    ? never
    : K extends symbol | InternalKeys
      ? never
      : B extends true
        ? T[K] & {} extends Scalar
            ? never
            : K
        : K;
type ExtractStringKeys<T> = {
    [K in keyof T]: CleanKeys<T, K>;
}[keyof T] & {};
type StringKeys<T, E extends string = never> =
    T extends DtoCollection<any>
        ? ExtractStringKeys<ExtractType<T>> | E
        : T extends DtoRef<any>
          ? ExtractStringKeys<ExtractType<T>> | E
          : T extends object
            ? ExtractStringKeys<ExtractType<T>> | E
            : never;
type GetStringKey<T, K extends StringKeys<T, string>, E extends string> = K extends keyof T
    ? ExtractType<T[K]>
    : K extends E
      ? keyof T
      : never;
type CollectionKeys<T> = T extends object
    ? {
          [K in keyof T]: T[K] extends DtoCollection<any> ? (IsAny<T[K]> extends true ? never : K & string) : never;
      }[keyof T] & {}
    : never;

/**
 * @deprecated Don't use this in dto code! Always import from @mikro-orm/core. These classes are only used when exporting the browser compatible library
 */
export type AutoPath<
    O,
    P extends string | boolean,
    E extends string = never,
    D extends Prev[number] = 9,
> = P extends boolean
    ? P
    : [D] extends [never]
      ? never
      : P extends any
        ? P extends string
            ? (P & `${string}.` extends never ? P : P & `${string}.`) extends infer Q
                ? Q extends `${infer A}.${infer B}`
                    ? A extends StringKeys<O, E>
                        ? `${A}.${AutoPath<NonNullable<GetStringKey<O, A, E>>, B, E, Prev[D]>}`
                        : never
                    : Q extends StringKeys<O, E>
                      ?
                            | (NonNullable<GetStringKey<O, Q, E>> extends unknown ? Exclude<P, `${string}.`> : never)
                            | (StringKeys<NonNullable<GetStringKey<O, Q, E>>, E> extends never
                                  ? never
                                  : `${Q & string}.`)
                      : StringKeys<O, E> | `${CollectionKeys<O>}:ref`
                : never
            : never
        : never;

/**
 * @deprecated Don't use this in dto code! Always import from @mikro-orm/core. These classes are only used when exporting the browser compatible library
 */
export type Populate<T, P extends string = never> = readonly AutoPath<T, P, `${PopulatePath}`>[] | false;
type EntityKey<T = unknown, B extends boolean = false> = string &
    {
        [K in keyof T]-?: CleanKeys<T, K, B> extends never ? never : K;
    }[keyof T];

/**
 * @deprecated Don't use this in dto code! Always import from @mikro-orm/core. These classes are only used when exporting the browser compatible library
 */
export type FilterObject<T> = {
    -readonly [K in EntityKey<T>]?: any;
};

/**
 * @deprecated Don't use this in dto code! Always import from @mikro-orm/core. These classes are only used when exporting the browser compatible library
 */
export interface FindOptions {}

/**
 * @deprecated Don't use this in dto code! Always import from @mikro-orm/core. These classes are only used when exporting the browser compatible library
 */
export interface FindAllOptions {}

/**
 * @deprecated Don't use this in dto code! Always import from @mikro-orm/core. These classes are only used when exporting the browser compatible library
 */
export interface CountOptions {}

type ExpandScalar<T> =
    | null
    | (T extends string
          ? T | RegExp
          : T extends Date
            ? Date | string
            : T extends bigint
              ? bigint | string | number
              : T);
type ReadonlyPrimary<T> = T extends any[] ? Readonly<T> : T;
type PrimaryPropToType<T, Keys extends (keyof T)[]> = {
    [Index in keyof Keys]: UnwrapPrimary<T[Keys[Index]]>;
};
type Primary<T> =
    IsAny<T> extends true
        ? any
        : T extends {
                [PrimaryKeyProp]?: infer PK;
            }
          ? PK extends keyof T
              ? ReadonlyPrimary<UnwrapPrimary<T[PK]>>
              : PK extends (keyof T)[]
                ? ReadonlyPrimary<PrimaryPropToType<T, PK>>
                : PK
          : T extends {
                  _id?: infer PK;
              }
            ? ReadonlyPrimary<PK> | string
            : T extends {
                    uuid?: infer PK;
                }
              ? ReadonlyPrimary<PK>
              : T extends {
                      id?: infer PK;
                  }
                ? ReadonlyPrimary<PK>
                : T;
type UnwrapPrimary<T> = T extends Scalar ? T : T extends DtoRef<infer U> ? Primary<U> : Primary<T>;
type PrimaryProperty<T> = T extends {
    [PrimaryKeyProp]?: infer PK;
}
    ? PK extends keyof T
        ? PK
        : PK extends any[]
          ? PK[number]
          : never
    : T extends {
            _id?: any;
        }
      ? T extends {
            id?: any;
        }
          ? 'id' | '_id'
          : '_id'
      : T extends {
              uuid?: any;
          }
        ? 'uuid'
        : T extends {
                id?: any;
            }
          ? 'id'
          : never;
type FilterItemValue<T> = T | ExpandScalar<T> | Primary<T>;
type EntityProps<T> = {
    -readonly [K in EntityKey<T>]?: T[K];
};
type FilterValue<T> = OperatorMap<FilterItemValue<T>> | FilterItemValue<T> | FilterItemValue<T>[] | null;
export type FilterQuery<T> =
    | ObjectQuery<T>
    | NonNullable<ExpandScalar<Primary<T>>>
    | NonNullable<EntityProps<T> & OperatorMap<T>>
    | FilterQuery<T>[];
type ExpandQuery<T> = T extends object ? (T extends Scalar ? never : FilterQuery<T>) : FilterValue<T>;
type OperatorMap<T> = {
    $and?: ExpandQuery<T>[];
    $or?: ExpandQuery<T>[];
    $eq?: ExpandScalar<T> | readonly ExpandScalar<T>[];
    $ne?: ExpandScalar<T>;
    $in?: readonly ExpandScalar<T>[];
    $nin?: readonly ExpandScalar<T>[];
    $not?: ExpandQuery<T>;
    $none?: ExpandQuery<T>;
    $some?: ExpandQuery<T>;
    $every?: ExpandQuery<T>;
    $gt?: ExpandScalar<T>;
    $gte?: ExpandScalar<T>;
    $lt?: ExpandScalar<T>;
    $lte?: ExpandScalar<T>;
    $like?: string;
    $re?: string;
    $ilike?: string;
    $fulltext?: string;
    $overlap?: readonly string[] | string | object;
    $contains?: readonly string[] | string | object;
    $contained?: readonly string[] | string | object;
    $exists?: boolean;
    $hasKey?: string;
    $hasKeys?: readonly string[];
    $hasSomeKeys?: readonly string[];
};
type ObjectQuery<T> = OperatorMap<T> & FilterObject<T>;

type ExpandProperty<T> =
    T extends DtoRef<infer U>
        ? NonNullable<U>
        : T extends DtoCollection<infer U>
          ? NonNullable<U>
          : T extends (infer U)[]
            ? NonNullable<U>
            : NonNullable<T>;
type QueryOrderMap<T> = {
    [K in EntityKey<T>]?: QueryOrderKeys<ExpandProperty<T[K]>>;
};

/**
 * @deprecated Don't use this in dto code! Always import from @mikro-orm/core. These classes are only used when exporting the browser compatible library
 */
export enum QueryOrder {
    ASC = 'ASC',
    ASC_NULLS_LAST = 'ASC NULLS LAST',
    ASC_NULLS_FIRST = 'ASC NULLS FIRST',
    DESC = 'DESC',
    DESC_NULLS_LAST = 'DESC NULLS LAST',
    DESC_NULLS_FIRST = 'DESC NULLS FIRST',
    asc = 'asc',
    asc_nulls_last = 'asc nulls last',
    asc_nulls_first = 'asc nulls first',
    desc = 'desc',
    desc_nulls_last = 'desc nulls last',
    desc_nulls_first = 'desc nulls first',
}

/**
 * @deprecated Don't use this in dto code! Always import from @mikro-orm/core. These classes are only used when exporting the browser compatible library
 */
export declare enum QueryOrderNumeric {
    ASC = 1,
    DESC = -1,
}
type QueryOrderKeysFlat = QueryOrder | QueryOrderNumeric | keyof typeof QueryOrder;
type QueryOrderKeys<T> = QueryOrderKeysFlat | QueryOrderMap<T>;

/**
 * @deprecated Don't use this in dto code! Always import from @mikro-orm/core. These classes are only used when exporting the browser compatible library
 */
export type OrderDefinition<T> =
    | (QueryOrderMap<T> & {
          0?: never;
      })
    | QueryOrderMap<T>[];
