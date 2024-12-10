import { DEFAULT_FORMAT, formatters } from './formats.js';
import { SideChannel } from './side-channel.js';
import type { ArrayFormat, DefaultValueEncoder, StringifyOptions, ValueEncoder } from './types.js';
import { encode, isBuffer, maybeMap } from './utils.js';

const arrayPrefixGenerators: Record<ArrayFormat, ((prefix: string, key: string) => string) | 'comma'> = {
    brackets: function brackets(prefix: string) {
        return prefix + '[]';
    },
    comma: 'comma',
    indices: function indices(prefix: string, key: string) {
        return prefix + '[' + key + ']';
    },
    repeat: function repeat(prefix: string) {
        return prefix;
    }
};

const isArray = Array.isArray;

function pushToArray<T>(array: T[], valueOrArray: T | T[]): void {
    array.push(...(Array.isArray(valueOrArray) ? valueOrArray : [valueOrArray]));
}

const defaults: Omit<StringifyOptions, 'encoder'> & { encoder: DefaultValueEncoder } = {
    addQueryPrefix: false,
    allowDots: false,
    arrayFormat: 'indices',
    charset: 'utf-8',
    charsetSentinel: false,
    delimiter: '&',
    encode: true,
    encoder: encode,
    encodeValuesOnly: false,
    format: DEFAULT_FORMAT,
    formatter: formatters[DEFAULT_FORMAT],
    // deprecated
    indices: false,
    serializeDate: (date: Date) => date?.toISOString(),
    skipNulls: false,
    strictNullHandling: false
};

function isNonNullishPrimitive(v: unknown): v is string | number | boolean | symbol | bigint {
    return (
        typeof v === 'string' ||
        typeof v === 'number' ||
        typeof v === 'boolean' ||
        typeof v === 'symbol' ||
        typeof v === 'bigint'
    );
}

const sentinel = {};

function internalStringify({
    object,
    prefix,
    generateArrayPrefix,
    commaRoundTrip,
    strictNullHandling,
    skipNulls,
    encoder,
    filter,
    sort,
    allowDots,
    serializeDate,
    format,
    formatter,
    encodeValuesOnly,
    charset,
    sideChannel
}: {
    object: any;
    prefix: string;
    generateArrayPrefix: 'comma' | ((prefix: string, key: string) => string);
    commaRoundTrip: boolean;
    sideChannel: any;
    encoder: ValueEncoder | null;
} & Pick<
    StringifyOptions,
    | 'strictNullHandling'
    | 'skipNulls'
    | 'filter'
    | 'sort'
    | 'allowDots'
    | 'serializeDate'
    | 'format'
    | 'formatter'
    | 'encodeValuesOnly'
    | 'charset'
>) {
    let obj: string | Record<string, any> = object;

    let tmpSc = sideChannel;
    let step = 0;
    let findFlag = false;
    while ((tmpSc = tmpSc.get(sentinel)) !== void undefined && !findFlag) {
        // Where object last appeared in the ref tree
        const pos = tmpSc.get(object);
        step += 1;
        if (typeof pos !== 'undefined') {
            if (pos === step) {
                throw new RangeError('Cyclic object value');
            } else {
                findFlag = true; // Break while
            }
        }
        if (typeof tmpSc.get(sentinel) === 'undefined') {
            step = 0;
        }
    }

    if (typeof filter === 'function') {
        obj = filter(prefix, obj);
    } else if (obj instanceof Date) {
        obj = serializeDate(obj);
    } else if (generateArrayPrefix === 'comma' && isArray(obj)) {
        obj = maybeMap(obj, (value) => (value instanceof Date ? serializeDate(value) : value));
    }

    if (obj === null) {
        if (strictNullHandling) {
            return encoder && !encodeValuesOnly
                ? encoder(prefix, defaults.encoder as DefaultValueEncoder, charset, 'key', format)
                : prefix;
        }

        obj = '';
    }

    if (isNonNullishPrimitive(obj) || isBuffer(obj)) {
        if (encoder) {
            const keyValue = encodeValuesOnly
                ? prefix
                : encoder(prefix, defaults.encoder as DefaultValueEncoder, charset, 'key', format);
            return [
                formatter(keyValue) +
                    '=' +
                    formatter(encoder(obj, defaults.encoder as DefaultValueEncoder, charset, 'value', format))
            ];
        }
        return [formatter(prefix) + '=' + formatter(String(obj))];
    }

    const values = [];

    if (typeof obj === 'undefined') {
        return values;
    }

    let objKeys;
    if (generateArrayPrefix === 'comma' && isArray(obj)) {
        // we need to join elements in
        if (encodeValuesOnly && encoder) {
            // @ts-ignore
            obj = maybeMap(obj, encoder);
        }
        // @ts-ignore
        objKeys = [{ value: obj.length > 0 ? obj.join(',') || null : void undefined }];
    } else if (Array.isArray(filter)) {
        objKeys = filter;
    } else {
        const keys = Object.keys(obj);
        objKeys = sort ? keys.sort(sort) : keys;
    }

    const adjustedPrefix = commaRoundTrip && isArray(obj) && obj.length === 1 ? prefix + '[]' : prefix;

    for (let j = 0; j < objKeys.length; ++j) {
        const key = objKeys[j];
        const value = typeof key === 'object' && typeof key.value !== 'undefined' ? key.value : obj[key];

        if (skipNulls && value === null) {
            continue;
        }

        const keyPrefix = isArray(obj)
            ? typeof generateArrayPrefix === 'function'
                ? generateArrayPrefix(adjustedPrefix, key)
                : adjustedPrefix
            : adjustedPrefix + (allowDots ? '.' + key : '[' + key + ']');

        sideChannel.set(object, step);
        const valueSideChannel = new SideChannel();
        valueSideChannel.set(sentinel, sideChannel);
        pushToArray(
            values,
            internalStringify({
                object: value,
                prefix: keyPrefix,
                generateArrayPrefix,
                commaRoundTrip,
                strictNullHandling,
                skipNulls,
                encoder: generateArrayPrefix === 'comma' && encodeValuesOnly && isArray(obj) ? null : encoder,
                filter,
                sort,
                allowDots,
                serializeDate,
                format,
                formatter,
                encodeValuesOnly,
                charset,
                sideChannel: valueSideChannel
            })
        );
    }

    return values;
}

function normalizeStringifyOptions(opts: Partial<StringifyOptions> | undefined) {
    if (!opts) {
        return defaults;
    }

    if (opts.encoder !== null && typeof opts.encoder !== 'undefined' && typeof opts.encoder !== 'function') {
        throw new TypeError('Encoder has to be a function.');
    }

    const charset = opts.charset || defaults.charset;
    if (typeof opts.charset !== 'undefined' && opts.charset !== 'utf-8' && opts.charset !== 'iso-8859-1') {
        throw new TypeError('The charset option must be either utf-8, iso-8859-1, or undefined');
    }

    let format = DEFAULT_FORMAT;
    if (typeof opts.format !== 'undefined') {
        if (!Object.hasOwn(formatters, opts.format)) {
            throw new TypeError('Unknown format option provided.');
        }
        format = opts.format;
    }
    const formatter = formatters[format];

    let filter = defaults.filter;
    if (typeof opts.filter === 'function' || isArray(opts.filter)) {
        filter = opts.filter;
    }

    let arrayFormat: ArrayFormat;
    if (opts.arrayFormat && Object.hasOwn(arrayPrefixGenerators, opts.arrayFormat)) {
        arrayFormat = opts.arrayFormat;
    } else if (Object.hasOwn(opts, 'indices')) {
        arrayFormat = opts.indices ? 'indices' : 'repeat';
    } else {
        arrayFormat = defaults.arrayFormat;
    }

    if ('commaRoundTrip' in opts && typeof opts.commaRoundTrip !== 'boolean') {
        throw new TypeError('`commaRoundTrip` must be a boolean, or absent');
    }

    return {
        addQueryPrefix: typeof opts.addQueryPrefix === 'boolean' ? opts.addQueryPrefix : defaults.addQueryPrefix,
        allowDots: typeof opts.allowDots === 'undefined' ? defaults.allowDots : !!opts.allowDots,
        arrayFormat,
        charset,
        charsetSentinel: typeof opts.charsetSentinel === 'boolean' ? opts.charsetSentinel : defaults.charsetSentinel,
        commaRoundTrip: opts.commaRoundTrip,
        delimiter: typeof opts.delimiter === 'undefined' ? defaults.delimiter : opts.delimiter,
        encode: typeof opts.encode === 'boolean' ? opts.encode : defaults.encode,
        encoder: typeof opts.encoder === 'function' ? opts.encoder : defaults.encoder,
        encodeValuesOnly:
            typeof opts.encodeValuesOnly === 'boolean' ? opts.encodeValuesOnly : defaults.encodeValuesOnly,
        filter,
        format,
        formatter,
        serializeDate: typeof opts.serializeDate === 'function' ? opts.serializeDate : defaults.serializeDate,
        skipNulls: typeof opts.skipNulls === 'boolean' ? opts.skipNulls : defaults.skipNulls,
        sort: typeof opts.sort === 'function' ? opts.sort : null,
        strictNullHandling:
            typeof opts.strictNullHandling === 'boolean' ? opts.strictNullHandling : defaults.strictNullHandling
    };
}

export function stringify(object: Record<string, any>, opts?: Partial<StringifyOptions>) {
    let obj = object;
    const options = normalizeStringifyOptions(opts);

    let objKeys;
    let filter;

    if (typeof options.filter === 'function') {
        filter = options.filter;
        obj = filter('', obj);
    } else if (Array.isArray(options.filter)) {
        filter = options.filter;
        objKeys = filter;
    }

    const keys: string[] = [];

    if (typeof obj !== 'object' || obj === null) {
        return '';
    }

    const generateArrayPrefix = arrayPrefixGenerators[options.arrayFormat];
    const commaRoundTrip = Boolean(generateArrayPrefix === 'comma' && options.commaRoundTrip);

    if (!objKeys) {
        objKeys = Object.keys(obj);
    }

    if (options.sort) {
        objKeys.sort(options.sort);
    }

    const sideChannel = new SideChannel();
    for (let i = 0; i < objKeys.length; ++i) {
        const key = objKeys[i];

        if (options.skipNulls && obj[key] === null) {
            continue;
        }

        pushToArray(
            keys,
            internalStringify({
                object: obj[key],
                prefix: key,
                generateArrayPrefix,
                // @ts-ignore
                commaRoundTrip: commaRoundTrip ?? false,
                ...options,
                encoder: options.encode ? (options.encoder as ValueEncoder) : null,
                sideChannel
            })
        );
    }

    const joined = keys.join(options.delimiter);
    let prefix = options.addQueryPrefix ? '?' : '';

    if (options.charsetSentinel) {
        if (options.charset === 'iso-8859-1') {
            // encodeURIComponent('&#10003;'), the "numeric entity" representation of a checkmark
            prefix += 'utf8=%26%2310003%3B&';
        } else {
            // encodeURIComponent('✓')
            prefix += 'utf8=%E2%9C%93&';
        }
    }

    return joined.length > 0 ? prefix + joined : '';
}
