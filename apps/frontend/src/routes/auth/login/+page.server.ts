import { loginFormSchema } from '$lib/util/formSchemas/LoginFormSchema.js';
import { fail, redirect } from '@sveltejs/kit';
import { message, superValidate } from 'sveltekit-superforms';
import { valibot } from 'sveltekit-superforms/adapters';
import type { PageServerLoad, Actions } from './$types';
import { ApiError, AuthApi } from '$lib/api/index.js';

export const load = (async () => {
	const form = await superValidate(valibot(loginFormSchema));

	return { form };
}) satisfies PageServerLoad;

export const actions = {
	default: async ({ request, fetch, cookies, url }) => {
		const form = await superValidate(request, valibot(loginFormSchema));

		if (!form.valid) {
			return fail(400, { form });
		}

		try {
			await AuthApi.login(
				{
					username: form.data.username,
					password: form.data.password
				},
				fetch,
				cookies
			);
		} catch (error) {
			console.log('error', error);

			return message(
				form,
				{
					type: 'error',
					text: error instanceof ApiError ? error.message : 'Login failed'
				},
				{
					status: error instanceof ApiError ? (error.statusCode as 400) : 500
				}
			);
		}

		const redirectTo = url.searchParams.get('redirectTo');
		redirect(302, redirectTo ? '/' + redirectTo.slice(1) : '/');
	}
} satisfies Actions;
