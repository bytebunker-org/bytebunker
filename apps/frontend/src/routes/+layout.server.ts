import type { LayoutServerLoad } from './$types';
import type { SupportedLocale } from '@bytebunker/backend';

export const load = (async ({ locals }) => {
	return {
		language: locals.language
	};
}) satisfies LayoutServerLoad<{ language: SupportedLocale }>;
