export type ASStringFallback = string & { __type: 'unknown-type' };
export type ASTypeWithFallback<S extends string> = S | ASStringFallback;
