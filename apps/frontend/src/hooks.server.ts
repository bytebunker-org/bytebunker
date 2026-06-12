import 'reflect-metadata/lite';
import { locale } from 'svelte-i18n';
import { pick } from '@escapace/accept-language-parser';
import type { Handle, HandleFetch } from '@sveltejs/kit';
import { defaultLocale, supportedLocales } from '@bytebunker/backend';
import { AuthApi } from '$lib/api/AuthApi.js';
import { ApiError } from '$lib/api/ApiError.js';

export const handle: Handle = async ({ event, resolve }) => {
	const acceptLanguageHeader = event.request.headers.get('accept-language');
	const browserLanguage = acceptLanguageHeader
		? pick(supportedLocales, acceptLanguageHeader, { loose: true })
		: undefined;
	const language = browserLanguage ?? defaultLocale;
	locale.set(language);
	event.locals.language = language ?? defaultLocale;

	try {
		event.locals.user = await AuthApi.getSession(event.fetch);
	} catch (error) {
		if (error instanceof ApiError) {
			if (error.statusCode !== 401 && error.statusCode !== 403) {
				console.warn(
					`Couldn't fetch user session: ${error.message} (Status Code: ${error.statusCode})`
				);
			}
		} else {
			console.warn("Couldn't fetch user session", error);
		}
	}

	return resolve(event, {
		filterSerializedResponseHeaders(name): boolean {
			return name === 'content-type';
		},
		transformPageChunk({ html }): string {
			return html.replace('%LANG%', event.locals.language);
		}
	});
};

export const handleFetch: HandleFetch = async ({ event, request, fetch }) => {
	// TODO: Insecure handling of fetches to public urls
	if (
		request.url.includes('192.168.') ||
		request.url.includes('127.') ||
		request.url.includes('bytebunker')
	) {
		const cookieHeader = event.request.headers.get('cookie');

		if (cookieHeader) {
			request.headers.set('cookie', cookieHeader);
		}
	}

	return fetch(request);
};
