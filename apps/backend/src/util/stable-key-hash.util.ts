import { isPlainObject } from './util.js';

export type StableKey = readonly unknown[];

/**
 * Hashes the value into a stable hash.
 */
function stableKeyHash<K extends StableKey>(value: K, ignorePrototypes = false): string {
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
export function hashStableKey<K extends StableKey>(stableKey: K): string {
    return stableKeyHash(stableKey);
}

/**
 * The same as hashStableKey but still works if there are any non-plain objects (class instances etc.)
 * @param stableKey
 */
export function hashStableKeyForcePlainObjects<K extends StableKey>(stableKey: K): string {
    return stableKeyHash(stableKey, true);
}
