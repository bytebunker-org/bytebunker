import type { Collection } from '@mikro-orm/core';

export function hasOwn<X, Y extends PropertyKey>(
    object: X,
    property: Y,
): object is NonNullable<X> & Record<Y, unknown> {
    return object && typeof object === 'object' && Object.prototype.hasOwnProperty.call(object, property);
}

export function indexObject(
    object: Record<string, unknown>,
    path: string | string[],
    value: unknown,
    separator = '.',
): unknown {
    if (typeof path === 'string') {
        return indexObject(object, path.split(separator), value, separator);
    } else if (path.length === 1 && value !== undefined) {
        return (object[path[0]] = value);
    } else if (path.length === 0) {
        return object;
    } else {
        if (object[path[0]] === undefined) {
            object[path[0]] = {};
        }

        return indexObject(object[path[0]] as Record<string, unknown>, path.slice(1), value, separator);
    }
}

export function isEnumValue<E extends Record<string, any>>(enumType: E, value: unknown): value is E[keyof E] {
    return Object.values(enumType).includes(value);
}

export function groupByKey<T, KeyType extends string | number | symbol = string>(
    array: T[],
    key: keyof T,
): Record<KeyType, T[]> {
    // @ts-ignore
    return array.reduce((hash, object) => {
        if (object[key] === undefined) {
            return hash;
        }

        // @ts-ignore
        return Object.assign(hash, { [object[key]]: [...(hash[object[key]] || []), object] });
    }, {});
}

export function groupByKeySingle<T extends object, KeyType extends string | number | symbol = string>(
    array: T[] | Collection<T>,
    key: keyof T,
): Record<KeyType, T> {
    return array.reduce((hash, object) => {
        if (object[key] === undefined) {
            return hash;
        }

        return Object.assign(hash, { [object[key] as KeyType]: object });
    }, {}) as Record<KeyType, T>;
}

function hasObjectPrototype(o: any): boolean {
    return Object.prototype.toString.call(o) === '[object Object]';
}

// Copied from: https://github.com/jonschlinkert/is-plain-object
// eslint-disable-next-line @typescript-eslint/no-wrapper-object-types
export function isPlainObject(o: any): o is Object {
    if (!hasObjectPrototype(o)) {
        return false;
    }

    // If it has a modified constructor
    const ctor = o.constructor;
    if (ctor === undefined) {
        return true;
    }

    // If it has a modified prototype
    const proto = ctor.prototype;
    if (!hasObjectPrototype(proto)) {
        return false;
    }

    // If constructor does not have an Object-specific method
    // eslint-disable-next-line no-prototype-builtins
    if (!proto.hasOwnProperty('isPrototypeOf')) {
        return false;
    }

    // Most likely a plain Object
    return true;
}
