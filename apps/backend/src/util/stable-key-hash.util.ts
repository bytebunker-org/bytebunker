import { isPlainObject } from './util.js';

export type StableKey = string | readonly unknown[];
export type EnsuredStableKey<T extends StableKey> = T extends string ? [T] : Exclude<T, string>;

/**
 * Hashes the value into a stable hash.
 */
function stableKeyHash<Q extends StableKey>(value: EnsuredStableKey<Q>, ignorePrototypes = false): string {
    return JSON.stringify(value, (_, value_) => {
        if ((ignorePrototypes && typeof value_ === 'object' && value_ !== null) || isPlainObject(value_)) {
            return Object.keys(value_)
                .sort()
                .reduce((result, key) => {
                    result[key] = value_[key];
                    return result;
                }, {} as any);
        } else {
            return value_;
        }
    });
}

// Copied from: https://github.com/SvelteStack/svelte-query/blob/main/src/queryCore/core/utils.ts
function ensureStableKeyArray<T extends StableKey>(value: T): EnsuredStableKey<T> {
    return (Array.isArray(value) ? value : ([value] as unknown)) as EnsuredStableKey<T>;
}

export function hashStableKey<Q extends StableKey>(stableKey: Q): string {
    const asArray = ensureStableKeyArray<Q>(stableKey);
    return stableKeyHash(asArray);
}

/**
 * The same as hashStableKey but still works if there are any non-plain objects (class instances etc.)
 * @param stableKey
 */
export function hashStableKeyForcePlainObjects<Q extends StableKey>(stableKey: Q): string {
    const asArray = ensureStableKeyArray<Q>(stableKey);
    return stableKeyHash(asArray, true);
}
