import type { LayoutServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';

export const load = (async ({ locals, url }) => {
	if (locals.user) {
		const redirectTo = url.searchParams.get('redirectTo');

		redirect(302, redirectTo ? '/' + redirectTo.slice(1) : '/');
	}
}) satisfies LayoutServerLoad;
