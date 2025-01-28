export function hasOwnProperty<X, Y extends PropertyKey>(obj: X, prop: Y): obj is NonNullable<X> & Record<Y, unknown> {
    return typeof obj !== 'undefined' && obj !== null && Object.hasOwn(obj as object, prop);
}

export function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

export function preventEvent(e: Event): void {
    e.preventDefault();
}

type ClassNameType = string | number | (string | number)[] | Record<string, boolean>;

function toClassName(value: ClassNameType): string {
    let result = '';

    if (typeof value === 'string' || typeof value === 'number') {
        result += value;
    } else if (typeof value === 'object') {
        if (Array.isArray(value)) {
            result = value.map(toClassName).filter(Boolean).join(' ');
        } else {
            for (const key of Object.keys(value)) {
                if (value[key]) {
                    if (result) {
                        result += ' ';
                    }

                    result += key;
                }
            }
        }
    }

    return result;
}

export function classnames(...args: ClassNameType[]): string {
    return args.map(toClassName).filter(Boolean).join(' ');
}

const missingKeyValueMappings = new Set<string>();

/**
 * Map key-value pairs using the passed in map.
 *
 * @param map the mapping from key to value
 * @param key the key to get the value for
 * @param defaultToKey should the key be returned as the value, in case a key to value mapping doesn't exist
 */
export function mapValue<Key extends string, Value extends string>(
    map: Record<Key, Value>,
    key: Key,
    defaultToKey = false
): Value | undefined {
    if (!hasOwnProperty(map, key)) {
        if (defaultToKey) {
            return key as unknown as Value;
        } else {
            if (!missingKeyValueMappings.has(key)) {
                const keys = Object.keys(map).slice(0, 5).join(', ');
                const values = Object.values(map).slice(0, 5).join(', ');
                console.warn(`Can't map key ${key} to a value for the mapping ${keys} -> ${values}`);

                missingKeyValueMappings.add(key);
            }

            return undefined;
        }
    }
}
