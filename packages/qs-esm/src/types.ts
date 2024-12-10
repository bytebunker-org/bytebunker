export type Charset = 'utf-8' | 'iso-8859-1';

export type DefaultValueEncoder = (
    str: any,
    defaultEncoder: DefaultValueEncoder | undefined,
    charset: Charset | undefined,
    kind: any,
    format: QueryRfcFormat | undefined
) => string;
export type DefaultValueDecoder = (str: string, decoder: DefaultValueDecoder, charset: Charset) => string;

export type ValueDecoder = (
    str: string,
    defaultDecoder: DefaultValueDecoder,
    charset: Charset,
    type: 'key' | 'value',
    format?: QueryRfcFormat
) => any;
export type ValueEncoder = (
    str: any,
    defaultEncoder: DefaultValueEncoder,
    charset: Charset,
    type: 'key' | 'value',
    format?: QueryRfcFormat
) => string;

export type Formatter = (value: string) => string;
export type ArrayFormat = 'indices' | 'brackets' | 'repeat' | 'comma';
export type QueryRfcFormat = 'RFC1738' | 'RFC3986';
export type DateSerializer = (date: Date) => string;

export type ParseOptionsType = {
    allowDots: boolean;
    allowPrototypes: boolean;
    allowSparse: boolean;
    arrayLimit: number;
    charset: Charset;
    charsetSentinel: boolean;
    comma: boolean;
    decoder: ValueDecoder;
    delimiter: string | RegExp;
    depth: number | false;
    ignoreQueryPrefix: boolean;
    interpretNumericEntities: boolean;
    parameterLimit: number;
    parseArrays: boolean;
    plainObjects: boolean;
    strictNullHandling: boolean;
};

export interface StringifyOptions {
    addQueryPrefix: boolean;
    allowDots: boolean;
    arrayFormat: ArrayFormat;
    commaRoundTrip?: boolean | null;
    charset: Charset;
    charsetSentinel: boolean;
    delimiter: string;
    encode: boolean;
    encoder: ValueEncoder;
    encodeValuesOnly: boolean;
    format: QueryRfcFormat;
    formatter: Formatter;
    /**
     * @deprecated: use arrayFormat instead
     */
    indices: boolean;
    serializeDate: DateSerializer;
    skipNulls: boolean;
    strictNullHandling: boolean;
    filter?: string[] | ((prefix: string, value: any) => any);
    sort?: (a: string, b: string) => number;
}

export interface ParsedQs {
    [key: string]: undefined | string | string[] | ParsedQs | ParsedQs[];
}
