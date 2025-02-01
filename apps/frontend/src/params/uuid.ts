import type { ParamMatcher } from '@sveltejs/kit';

const uuidRegex = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i;

export const match: ParamMatcher = (param): param is string => {
    return uuidRegex.test(param);
};
