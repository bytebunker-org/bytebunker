import { ApiBase } from './ApiBase.js';
import type { LoginDto, UserSessionDto } from '@bytebunker/backend';
import type { Cookies } from '@sveltejs/kit';

export class AuthApi extends ApiBase {
	public static login(
		data: LoginDto,
		fetchImpl?: typeof fetch,
		ssrCookies?: Cookies
	): Promise<UserSessionDto> {
		return ApiBase.post(fetchImpl, '/auth/login', data, { ssrCookies });
	}

	public static getSession(fetchImpl?: typeof fetch): Promise<UserSessionDto> {
		return ApiBase.get(fetchImpl, '/auth/session');
	}

	public static logout(fetchImpl?: typeof fetch): Promise<UserSessionDto> {
		return ApiBase.post(fetchImpl, '/auth/logout');
	}
}
