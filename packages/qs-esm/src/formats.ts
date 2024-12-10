import type { Formatter, QueryRfcFormat } from './types.js';

const percentTwenties = /%20/g;

export const formatters: Record<QueryRfcFormat, Formatter> = {
    RFC1738: (value) => (typeof value === 'string' ? value.replace(percentTwenties, '+') : value),
    RFC3986: (value) => String(value)
};
export const RFC1738: QueryRfcFormat = 'RFC1738';
export const RFC3986: QueryRfcFormat = 'RFC3986';
export const DEFAULT_FORMAT: QueryRfcFormat = RFC3986;
