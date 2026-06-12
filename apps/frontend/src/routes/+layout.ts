import 'reflect-metadata/lite';
import { browser } from '$app/environment';
import type { LayoutLoad } from './$types';
import { QueryClient } from '@tanstack/svelte-query';
import type { SupportedLocale } from '@bytebunker/backend';
import { initI18n } from '$lib/i18n/initI18n.js';
import { locale, waitLocale } from 'svelte-i18n';

export const load = (async ({ data }) => {
	const { language } = data;

	initI18n(language);
	locale.set(language);

	await waitLocale();

	const queryClient = new QueryClient({
		defaultOptions: {
			queries: {
				enabled: browser
			}
		}
	});

	return { queryClient, language };
}) satisfies LayoutLoad<{ queryClient: QueryClient; language: SupportedLocale }>;
