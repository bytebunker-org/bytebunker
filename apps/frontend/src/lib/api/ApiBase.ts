import { ApiError } from './ApiError.js';
import { convertIsoToDateTime } from './util.js';
import type { Cookies } from '@sveltejs/kit';
import { parseString } from 'set-cookie-parser';
import { dev } from '$app/environment';
import { stringify } from '@bytebunker/qs-esm';
import { PUBLIC_API_BASE_URL, PUBLIC_PRODUCTION_COOKIE_DOMAIN } from '$env/static/public';

interface RequestOptions {
	params?: any;
	/**
	 * @default true
	 */
	sendCredentials?: boolean;
	headers?: HeadersInit | false;
	rawBody?: boolean;
	ssrCookies?: Cookies;
}

export abstract class ApiBase {
	protected static async get<Type>(
		fetchImplementation: typeof fetch | undefined,
		url: string,
		options: RequestOptions = {}
	): Promise<Type> {
		options.sendCredentials ??= true;

		const fetchFunc = fetchImplementation ?? fetch;
		const isCredentialsSupported = 'credentials' in Request.prototype;
		const queryParams = options.params ? '?' + stringify(options.params) : '';

		const response = await fetchFunc(PUBLIC_API_BASE_URL + url + queryParams, {
			method: 'GET',
			// Cloudflare pages doesn't support credentials with their default fetch implementation, only send them on SSR if we use SvelteKits fetch
			...(isCredentialsSupported && options.sendCredentials ? { credentials: 'include' } : {}),
			...(options.headers === false
				? {}
				: {
						headers: {
							Accept: 'application/json',
							...(options.headers ?? {})
						}
					})
		});

		await this.checkResponse(response);

		if (response.status === 204) {
			return {} as Type;
		} else {
			return this.transformResponse(await response.json()) as Type;
		}
	}

	protected static async post<Type>(
		fetchImplementation: typeof fetch | undefined,
		url: string,
		data?: unknown,
		options: RequestOptions = {}
	): Promise<Type> {
		options.sendCredentials ??= true;
		const fetchFunc = fetchImplementation ?? fetch;
		const isCredentialsSupported = 'credentials' in Request.prototype;
		const queryParams = options.params ? '?' + stringify(options.params) : '';

		const response = await fetchFunc(PUBLIC_API_BASE_URL + url + queryParams, {
			method: 'POST',
			body: options.rawBody ? (data as BodyInit) : JSON.stringify(data),
			// Cloudflare pages doesn't support credentials with their default fetch implementation, only send them on SSR if we use SvelteKits fetch
			...(isCredentialsSupported && options.sendCredentials ? { credentials: 'include' } : {}),
			...(options.headers === false
				? {}
				: {
						headers: {
							'Content-Type': 'application/json',
							Accept: 'application/json',
							...(options.headers ?? {})
						}
					})
		});

		await this.checkResponse(response);

		if (options.ssrCookies) {
			this.applySessionCookie(response, options.ssrCookies);
		}

		if (response.status === 204) {
			return {} as Type;
		} else {
			return this.transformResponse(await response.json()) as Type;
		}
	}

	protected static async patch<Type>(
		fetchImplementation: typeof fetch | undefined,
		url: string,
		data?: unknown,
		options: RequestOptions = {}
	): Promise<Type> {
		options.sendCredentials ??= true;
		const fetchFunc = fetchImplementation ?? fetch;
		const isCredentialsSupported = 'credentials' in Request.prototype;
		const queryParams = options.params ? '?' + stringify(options.params) : '';

		const response = await fetchFunc(PUBLIC_API_BASE_URL + url + queryParams, {
			method: 'PATCH',
			body: options.rawBody ? (data as BodyInit) : JSON.stringify(data),
			// Cloudflare pages doesn't support credentials with their default fetch implementation, only send them on SSR if we use SvelteKits fetch
			...(isCredentialsSupported && options.sendCredentials ? { credentials: 'include' } : {}),
			...(options.headers === false
				? {}
				: {
						headers: {
							'Content-Type': 'application/json',
							Accept: 'application/json',
							...(options.headers ?? {})
						}
					})
		});

		await this.checkResponse(response);

		if (options.ssrCookies) {
			this.applySessionCookie(response, options.ssrCookies);
		}

		if (response.status === 204) {
			return {} as Type;
		} else {
			return this.transformResponse(await response.json()) as Type;
		}
	}

	protected static async del<Type>(
		fetchImplementation: typeof fetch | undefined,
		url: string,
		options: RequestOptions = {}
	): Promise<Type> {
		options.sendCredentials ??= true;

		const fetchFunc = fetchImplementation ?? fetch;
		const isCredentialsSupported = 'credentials' in Request.prototype;
		const queryParams = options.params ? '?' + stringify(options.params) : '';

		const response = await fetchFunc(PUBLIC_API_BASE_URL + url + queryParams, {
			method: 'DELETE',
			// Cloudflare pages doesn't support credentials with their default fetch implementation, only send them on SSR if we use SvelteKits fetch
			...(isCredentialsSupported && options.sendCredentials ? { credentials: 'include' } : {}),
			...(options.headers === false
				? {}
				: {
						headers: {
							Accept: 'application/json',
							...(options.headers ?? {})
						}
					})
		});

		await this.checkResponse(response);

		if (response.status === 204) {
			return {} as Type;
		} else {
			return this.transformResponse(await response.json()) as Type;
		}
	}

	protected static async put<Type>(
		fetchImplementation: typeof fetch | undefined,
		url: string,
		data?: unknown,
		options: RequestOptions = {}
	): Promise<Type> {
		options.sendCredentials ??= true;

		const fetchFunc = fetchImplementation ?? fetch;
		const isCredentialsSupported = 'credentials' in Request.prototype;
		const queryParams = options.params ? '?' + stringify(options.params) : '';

		const response = await fetchFunc(PUBLIC_API_BASE_URL + url + queryParams, {
			method: 'PUT',
			body: options.rawBody ? (data as BodyInit) : JSON.stringify(data),
			// Cloudflare pages doesn't support credentials with their default fetch implementation, only send them on SSR if we use SvelteKits fetch
			...(isCredentialsSupported && options.sendCredentials ? { credentials: 'include' } : {}),
			...(options.headers === false
				? {}
				: {
						headers: {
							'Content-Type': 'application/json',
							Accept: 'application/json',
							...(options.headers ?? {})
						}
					})
		});

		await this.checkResponse(response);

		if (response.status === 204) {
			return {} as Type;
		} else {
			return this.transformResponse(await response.json()) as Type;
		}
	}

	protected static async checkResponse(response: Response): Promise<void> {
		if (!response.ok) {
			let responseData: { message?: string } = {};
			try {
				responseData = (await response.json()) as { message?: string };
			} catch {
				/* empty */
			}

			const error = new ApiError(responseData.message ?? 'Request failed', response.status ?? 0);

			if (error.statusCode === 401 || error.statusCode === 403) {
				console.warn(JSON.stringify(responseData, null, 2));
				console.warn('[Api Error] User not logged in');
			} else {
				console.error(
					'[Api Error] Response:',
					JSON.stringify(responseData, null, 2),
					', error:',
					error
				);
			}

			Object.assign(error, responseData);

			throw error;
		}
	}

	private static applySessionCookie(response: Response, ssrCookies: Cookies): void {
		if (response.headers.has('set-cookie')) {
			for (const cookieHeader of response.headers.getSetCookie()) {
				const cookie = parseString(cookieHeader);

				if (cookie.name !== 'sid') {
					continue;
				}

				ssrCookies.set('sid', cookie.value, {
					expires: cookie.expires,
					path: '/',
					sameSite: 'strict',
					domain: dev ? undefined : PUBLIC_PRODUCTION_COOKIE_DOMAIN,
					secure: !dev && Boolean(PUBLIC_PRODUCTION_COOKIE_DOMAIN?.trim()),
					httpOnly: true
				});
			}
		}
	}

	private static transformResponse<Type>(data: Type): Type {
		return convertIsoToDateTime(data as Record<string, any>) as Type;
	}
}
