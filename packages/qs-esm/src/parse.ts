import type { DefaultValueDecoder, DefaultValueEncoder, ParsedQs, ParseOptionsType } from './types.js';
import { combine, compact, decode, isRegExp, maybeMap, merge } from './utils.js';

const defaults: Omit<ParseOptionsType, 'decoder'> & { decoder: DefaultValueDecoder } = {
    allowDots: false,
    allowPrototypes: false,
    allowSparse: false,
    arrayLimit: 20,
    charset: 'utf-8',
    charsetSentinel: false,
    comma: false,
    decoder: decode,
    delimiter: '&',
    depth: 5,
    ignoreQueryPrefix: false,
    interpretNumericEntities: false,
    parameterLimit: 1000,
    parseArrays: true,
    plainObjects: false,
    strictNullHandling: false
};

function interpretNumericEntities(str: string): string {
    return str.replace(/&#(\d+);/g, function ($0, numberStr) {
        return String.fromCharCode(parseInt(numberStr, 10));
    });
}

function parseArrayValue(value: string | string[], options: ParseOptionsType): string | string[] {
    if (value && typeof value === 'string' && options.comma && value.indexOf(',') > -1) {
        return value.split(',');
    }

    return value;
}

// This is what browsers will submit when the ✓ character occurs in an
// application/x-www-form-urlencoded body and the encoding of the page containing
// the form is iso-8859-1, or when the submitted form has an accept-charset
// attribute of iso-8859-1. Presumably also with other charsets that do not contain
// the ✓ character, such as us-ascii.
const isoSentinel = 'utf8=%26%2310003%3B'; // encodeURIComponent('&#10003;')

// These are the percent-encoded utf-8 octets representing a checkmark, indicating that the request actually is utf-8 encoded.
const charsetSentinel = 'utf8=%E2%9C%93'; // encodeURIComponent('✓')

function parseQueryStringValues(str: string, options: ParseOptionsType) {
    type ParsedQuery = Record<string, string | string[] | null>;
    const obj: ParsedQuery = { __proto__: null };

    const cleanStr = options.ignoreQueryPrefix ? str.replace(/^\?/, '') : str;
    const limit = options.parameterLimit === Infinity ? undefined : options.parameterLimit;
    const parts = cleanStr.split(options.delimiter, limit);
    let skipIndex = -1; // Keep track of where the utf8 sentinel was found
    let i;

    let charset = options.charset;
    if (options.charsetSentinel) {
        for (i = 0; i < parts.length; ++i) {
            if (parts[i].indexOf('utf8=') === 0) {
                if (parts[i] === charsetSentinel) {
                    charset = 'utf-8';
                } else if (parts[i] === isoSentinel) {
                    charset = 'iso-8859-1';
                }
                skipIndex = i;
                i = parts.length; // The eslint settings do not allow break;
            }
        }
    }

    for (i = 0; i < parts.length; ++i) {
        if (i === skipIndex) {
            continue;
        }
        const part = parts[i];

        const bracketEqualsPos = part.indexOf(']=');
        const pos = bracketEqualsPos === -1 ? part.indexOf('=') : bracketEqualsPos + 1;

        let key;
        let val;
        if (pos === -1) {
            key = options.decoder(part, defaults.decoder, charset, 'key');
            val = options.strictNullHandling ? null : '';
        } else {
            key = options.decoder(part.slice(0, pos), defaults.decoder, charset, 'key');
            val = maybeMap(parseArrayValue(part.slice(pos + 1), options), (encodedVal) =>
                options.decoder(encodedVal, defaults.decoder, charset, 'value')
            );
        }

        if (val && options.interpretNumericEntities && charset === 'iso-8859-1') {
            val = interpretNumericEntities(val);
        }

        if (part.indexOf('[]=') > -1) {
            val = Array.isArray(val) ? [val] : val;
        }

        if (Object.hasOwn(obj, key)) {
            // @ts-ignore
            obj[key] = combine(obj[key], val);
        } else {
            obj[key] = val;
        }
    }

    return obj;
}

const parseValues = parseQueryStringValues;

function parseObject(chain: string[], val, options: ParseOptionsType, valuesParsed) {
    let leaf = valuesParsed ? val : parseArrayValue(val, options);

    for (let i = chain.length - 1; i >= 0; --i) {
        let obj;
        const root = chain[i];

        if (root === '[]' && options.parseArrays) {
            obj = [].concat(leaf);
        } else {
            obj = options.plainObjects ? Object.create(null) : {};
            const cleanRoot = root.charAt(0) === '[' && root.charAt(root.length - 1) === ']' ? root.slice(1, -1) : root;
            const index = parseInt(cleanRoot, 10);

            if (!options.parseArrays && cleanRoot === '') {
                obj = { 0: leaf };
            } else if (
                !isNaN(index) &&
                root !== cleanRoot &&
                String(index) === cleanRoot &&
                index >= 0 &&
                options.parseArrays &&
                index <= options.arrayLimit
            ) {
                obj = [];
                obj[index] = leaf;
            } else if (cleanRoot !== '__proto__') {
                obj[cleanRoot] = leaf;
            }
        }

        leaf = obj;
    }

    return leaf;
}

function parseQueryStringKeys(givenKey: string, val, options: ParseOptionsType, valuesParsed) {
    if (!givenKey) {
        return;
    }

    // Transform dot notation to bracket notation
    const key = options.allowDots ? givenKey.replace(/\.([^.[]+)/g, '[$1]') : givenKey;

    // The regex chunks

    const brackets = /(\[[^[\]]*])/;
    const child = /(\[[^[\]]*])/g;

    // Get the parent

    let segment: RegExpExecArray | null | false = (options.depth || 0) > 0 && brackets.exec(key);
    const parent = segment ? key.slice(0, segment.index) : key;

    // Stash the parent if it exists

    const keys: string[] = [];
    if (parent) {
        // If we aren't using plain objects, optionally prefix keys that would overwrite object prototype properties
        if (!options.plainObjects && Object.hasOwn(Object.prototype, parent)) {
            if (!options.allowPrototypes) {
                return;
            }
        }

        keys.push(parent);
    }

    // Loop through children appending to the array until we hit depth

    let i = 0;
    while ((options.depth || 0) > 0 && (segment = child.exec(key)) !== null && i < (options.depth || 0)) {
        i += 1;
        if (!options.plainObjects && Object.hasOwn(Object.prototype, segment[1].slice(1, -1))) {
            if (!options.allowPrototypes) {
                return;
            }
        }
        keys.push(segment[1]);
    }

    // If there's a remainder, just add whatever is left

    if (segment) {
        keys.push('[' + key.slice(segment.index) + ']');
    }

    return parseObject(keys, val, options, valuesParsed);
}

const parseKeys = parseQueryStringKeys;

function normalizeParseOptions(opts: Partial<ParseOptionsType> | undefined): ParseOptionsType {
    if (!opts) {
        return defaults;
    }

    if (opts.decoder !== null && opts.decoder !== undefined && typeof opts.decoder !== 'function') {
        throw new TypeError('Decoder has to be a function.');
    }

    if (typeof opts.charset !== 'undefined' && opts.charset !== 'utf-8' && opts.charset !== 'iso-8859-1') {
        throw new TypeError('The charset option must be either utf-8, iso-8859-1, or undefined');
    }
    const charset = typeof opts.charset === 'undefined' ? defaults.charset : opts.charset;

    return {
        allowDots: typeof opts.allowDots === 'undefined' ? defaults.allowDots : !!opts.allowDots,
        allowPrototypes: typeof opts.allowPrototypes === 'boolean' ? opts.allowPrototypes : defaults.allowPrototypes,
        allowSparse: typeof opts.allowSparse === 'boolean' ? opts.allowSparse : defaults.allowSparse,
        arrayLimit: typeof opts.arrayLimit === 'number' ? opts.arrayLimit : defaults.arrayLimit,
        charset: charset,
        charsetSentinel: typeof opts.charsetSentinel === 'boolean' ? opts.charsetSentinel : defaults.charsetSentinel,
        comma: typeof opts.comma === 'boolean' ? opts.comma : defaults.comma,
        decoder: typeof opts.decoder === 'function' ? opts.decoder : defaults.decoder,
        delimiter: typeof opts.delimiter === 'string' || isRegExp(opts.delimiter) ? opts.delimiter : defaults.delimiter,
        // eslint-disable-next-line no-implicit-coercion, no-extra-parens
        depth: typeof opts.depth === 'number' || opts.depth === false ? +opts.depth : defaults.depth,
        ignoreQueryPrefix: opts.ignoreQueryPrefix === true,
        interpretNumericEntities:
            typeof opts.interpretNumericEntities === 'boolean'
                ? opts.interpretNumericEntities
                : defaults.interpretNumericEntities,
        parameterLimit: typeof opts.parameterLimit === 'number' ? opts.parameterLimit : defaults.parameterLimit,
        parseArrays: opts.parseArrays !== false,
        plainObjects: typeof opts.plainObjects === 'boolean' ? opts.plainObjects : defaults.plainObjects,
        strictNullHandling:
            typeof opts.strictNullHandling === 'boolean' ? opts.strictNullHandling : defaults.strictNullHandling
    };
}

export function parse(
    str: Record<string, unknown>,
    options?: Partial<ParseOptionsType> & { decoder?: never | undefined }
): Record<string, unknown>;
export function parse(
    str: null | undefined,
    options?: Partial<ParseOptionsType> & { decoder?: never | undefined }
): Record<string, never>;
export function parse(str: string, options?: Partial<ParseOptionsType> & { decoder?: never | undefined }): ParsedQs;
export function parse(
    str: string | Record<string, string>,
    options?: Partial<ParseOptionsType>
): { [key: string]: unknown };
export function parse(
    str: string | Record<string, unknown> | null | undefined,
    opts?: Partial<ParseOptionsType>
): { [key: string]: unknown } | ParsedQs {
    const options = normalizeParseOptions(opts);

    if (str === '' || str === null || typeof str === 'undefined') {
        return options.plainObjects ? Object.create(null) : {};
    }

    const tempObj: Record<string, unknown> = typeof str === 'string' ? parseValues(str, options) : str;
    let obj = options.plainObjects ? Object.create(null) : {};

    // Iterate over the keys and setup the new object

    const keys = Object.keys(tempObj);
    for (let i = 0; i < keys.length; ++i) {
        const key = keys[i];
        const newObj = parseKeys(key, tempObj[key], options, typeof str === 'string');

        obj = merge(obj, newObj, options);
    }

    if (options.allowSparse) {
        return obj;
    }

    return compact(obj);
}
