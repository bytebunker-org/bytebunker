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

export function groupByKeySingle<T, KeyType extends string | number | symbol = string>(
    array: T[],
    key: keyof T,
): Record<KeyType, T> {
    // @ts-ignore
    return array.reduce((hash, object) => {
        if (object[key] === undefined) {
            return hash;
        }

        // @ts-ignore
        return Object.assign(hash, { [object[key]]: object });
    }, {});
}
