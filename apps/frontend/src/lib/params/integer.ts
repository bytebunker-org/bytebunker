import type { ParamMatcher } from '@sveltejs/kit';

export const match = ((param): param is string => {
    return /^\d+$/.test(param) && !Number.isNaN(Number.parseInt(param));
}) satisfies ParamMatcher;
