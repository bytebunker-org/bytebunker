import { browser } from '$app/environment';
import { init, addMessages } from 'svelte-i18n';
import localeEn from './locales/en/index.js';
import { defaultLocale, type SupportedLocale } from '@bytebunker/backend';
import '@valibot/i18n/de';
import { setGlobalConfig } from 'valibot';

export function initI18n(initialLocale?: SupportedLocale) {
	addMessages('en', localeEn as any);
	// register('de', () => import('./locales/de/index.js'));

	init({
		fallbackLocale: defaultLocale,
		initialLocale: initialLocale
			? initialLocale
			: browser
				? window.navigator.language
				: defaultLocale
	});

	setGlobalConfig({ lang: initialLocale });
}
