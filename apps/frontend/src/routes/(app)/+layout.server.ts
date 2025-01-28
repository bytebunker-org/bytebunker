import type { LayoutServerLoad } from './$types';
import type { UserSessionDto } from '@bytebunker/backend';
import { redirect } from '@sveltejs/kit';

export const load = (async ({ locals, url }) => {
	if (!locals.user) {
		const fromUrl = url.pathname + url.search;

		redirect(302, fromUrl?.length > 1 ? `/auth/login?redirectTo=${fromUrl}` : '/auth/login');
	}

	return {
		user: locals.user
	};
}) satisfies LayoutServerLoad<{ user: UserSessionDto }>;
