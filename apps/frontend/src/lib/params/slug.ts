import type { ParamMatcher } from '@sveltejs/kit';
import { slugRegex } from '$lib/util/util.js';

/**
 * Subdomains can contain letters, 0-9 and - (but only in the middle of the string)
 * // https://stackoverflow.com/a/7933253/6311961
 */
export const match = ((param): param is string => {
    return slugRegex.test(param);
}) satisfies ParamMatcher;
