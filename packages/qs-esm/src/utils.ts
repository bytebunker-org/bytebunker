import { RFC1738 } from './formats.js';
import type { Charset, QueryRfcFormat, ValueDecoder, ValueEncoder } from './types.js';

const has = Object.prototype.hasOwnProperty;

const hexTable: string[] = (function () {
    const array: string[] = [];
    for (let i = 0; i < 256; ++i) {
        array.push('%' + ((i < 16 ? '0' : '') + i.toString(16)).toUpperCase());
    }

    return array;
})();

export function arrayToObject<T>(source: T[], options: { plainObjects: boolean }): Record<number, T> {
    const obj = options && options.plainObjects ? Object.create(null) : {};

    for (let i = 0; i < source.length; ++i) {
        if (typeof source[i] !== 'undefined') {
            obj[i] = source[i];
        }
    }

    return obj;
}

export function merge(target, source, options) {
    /* eslint no-param-reassign: 0 */
    if (!source) {
        return target;
    }

    if (typeof source !== 'object') {
        if (Array.isArray(target)) {
            target.push(source);
        } else if (target && typeof target === 'object') {
            if ((options && (options.plainObjects || options.allowPrototypes)) || !has.call(Object.prototype, source)) {
                target[source] = true;
            }
        } else {
            return [target, source];
        }

        return target;
    }

    if (!target || typeof target !== 'object') {
        return [target].concat(source);
    }

    let mergeTarget = target;
    if (Array.isArray(target) && !Array.isArray(source)) {
        mergeTarget = arrayToObject(target, options);
    }

    if (Array.isArray(target) && Array.isArray(source)) {
        source.forEach((item, i) => {
            if (has.call(target, i)) {
                const targetItem = target[i];
                if (targetItem && typeof targetItem === 'object' && item && typeof item === 'object') {
                    target[i] = merge(targetItem, item, options);
                } else {
                    target.push(item);
                }
            } else {
                target[i] = item;
            }
        });
        return target;
    }

    return Object.keys(source).reduce(function (acc, key) {
        const value = source[key];

        if (has.call(acc, key)) {
            acc[key] = merge(acc[key], value, options);
        } else {
            acc[key] = value;
        }
        return acc;
    }, mergeTarget);
}

export function assignSingleSource(target: any, source: any) {
    return Object.keys(source).reduce(function (acc, key) {
        acc[key] = source[key];
        return acc;
    }, target);
}

export function decode(str: string, decoder?: ValueDecoder, charset?: Charset): string {
    const strWithoutPlus = str.replace(/\+/g, ' ');
    if (charset === 'iso-8859-1') {
        // unescape never throws, no try...catch needed:
        return strWithoutPlus.replace(/%[0-9a-f]{2}/gi, unescape);
    }
    // utf-8
    try {
        return decodeURIComponent(strWithoutPlus);
    } catch (e) {
        return strWithoutPlus;
    }
}

export function encode(
    str: string,
    defaultEncoder: ValueEncoder | undefined,
    charset: Charset | undefined,
    kind,
    format: QueryRfcFormat | undefined
): string {
    // This code was originally written by Brian White (mscdex) for the io.js core querystring library.
    // It has been adapted here for stricter adherence to RFC 3986
    if (str.length === 0) {
        return str;
    }

    let string = str;
    if (typeof str === 'symbol') {
        string = Symbol.prototype.toString.call(str);
    } else if (typeof str !== 'string') {
        string = String(str);
    }

    if (charset === 'iso-8859-1') {
        return encodeURIComponent(string).replace(/%u[0-9a-f]{4}/gi, function ($0) {
            return '%26%23' + parseInt($0.slice(2), 16) + '%3B';
        });
    }

    let out = '';
    for (let i = 0; i < string.length; ++i) {
        let c = string.charCodeAt(i);

        if (
            c === 0x2d || // -
            c === 0x2e || // .
            c === 0x5f || // _
            c === 0x7e || // ~
            (c >= 0x30 && c <= 0x39) || // 0-9
            (c >= 0x41 && c <= 0x5a) || // a-z
            (c >= 0x61 && c <= 0x7a) || // A-Z
            (format === RFC1738 && (c === 0x28 || c === 0x29)) // ( )
        ) {
            out += string.charAt(i);
            continue;
        }

        if (c < 0x80) {
            out = out + hexTable[c];
            continue;
        }

        if (c < 0x800) {
            out = out + (hexTable[0xc0 | (c >> 6)] + hexTable[0x80 | (c & 0x3f)]);
            continue;
        }

        if (c < 0xd800 || c >= 0xe000) {
            out = out + (hexTable[0xe0 | (c >> 12)] + hexTable[0x80 | ((c >> 6) & 0x3f)] + hexTable[0x80 | (c & 0x3f)]);
            continue;
        }

        i += 1;
        c = 0x10000 + (((c & 0x3ff) << 10) | (string.charCodeAt(i) & 0x3ff));
        out +=
            hexTable[0xf0 | (c >> 18)] +
            hexTable[0x80 | ((c >> 12) & 0x3f)] +
            hexTable[0x80 | ((c >> 6) & 0x3f)] +
            hexTable[0x80 | (c & 0x3f)];
    }

    return out;
}

type QueueItem = {
    obj: Record<string, any>;
    prop: string;
};

function compactQueue(queue: QueueItem[]): void {
    while (queue.length > 1) {
        const item = queue.pop();
        if (!item) continue;

        const obj = item.obj[item.prop];

        if (Array.isArray(obj)) {
            const compacted: any[] = [];

            for (let j = 0; j < obj.length; ++j) {
                if (typeof obj[j] !== 'undefined') {
                    compacted.push(obj[j]);
                }
            }

            item.obj[item.prop] = compacted;
        }
    }
}

export function compact(value: Record<string, any>): Record<string, any> {
    const queue: QueueItem[] = [{ obj: { o: value }, prop: 'o' }];
    const refs: any[] = [];

    for (let i = 0; i < queue.length; ++i) {
        const item = queue[i];
        const obj = item.obj[item.prop];

        const keys = Object.keys(obj);
        for (let j = 0; j < keys.length; ++j) {
            const key = keys[j];
            const val = obj[key];
            if (typeof val === 'object' && val !== null && refs.indexOf(val) === -1) {
                queue.push({ obj: obj, prop: key });
                refs.push(val);
            }
        }
    }

    compactQueue(queue);

    return value;
}

export function isRegExp(obj: unknown): obj is RegExp {
    return Object.prototype.toString.call(obj) === '[object RegExp]';
}

export function isBuffer(obj: unknown): boolean {
    if (!obj || typeof obj !== 'object') {
        return false;
    }

    // @ts-ignore
    return !!(obj.constructor && obj.constructor.isBuffer && obj.constructor.isBuffer(obj));
}

export function combine<T>(a: T[], b: T[]): T[] {
    return ([] as T[]).concat(a, b);
}

export function maybeMap<T, R>(value: T | T[], fn: (value: T) => R): R | R[] {
    if (Array.isArray(value)) {
        return value.map(fn); // Using Array's map method for simplicity
    } else {
        return fn(value);
    }
}
