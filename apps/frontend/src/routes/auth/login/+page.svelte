<script lang="ts">
	import Img from '@zerodevx/svelte-img';
	import { page } from '$app/state';
	import { applyAction } from '$app/forms';
	import { superForm } from 'sveltekit-superforms';
	import { valibotClient } from 'sveltekit-superforms/adapters';
	import { Control, Field, Label } from 'formsnap';
	import type { PageProps } from './$types';
	import { getFlash } from 'sveltekit-flash-message';
	import { sendFormToasts } from '$lib/util/util.js';
	import { loginFormSchema } from '$lib/util/formSchemas/LoginFormSchema.js';
	import { Button } from '@bytebunker/daisyui-components';
	import TranslatedFieldErrors from '$lib/util/TranslatedFieldErrors.svelte';
	import { goto } from '$app/navigation';
	import { fromStore } from 'svelte/store';

	let { data }: PageProps = $props();
	const flash = fromStore(getFlash(page));

	$effect(() => {
		if (flash.current) {
			sendFormToasts({ type: flash.current.type, text: flash.current.message });
		}
	});

	const form = superForm(data.form, {
		validators: valibotClient(loginFormSchema),
		onUpdated: ({ form }) => sendFormToasts(form.message),
		applyAction: false,
		onResult: async ({ result }) => {
			if (result.type === 'redirect') {
				await goto(result.location, {
					replaceState: true,
					invalidateAll: true
				});
				location.replace(result.location);
			} else {
				await applyAction(result);
			}
		}
	});
	const { form: formData, enhance, submitting, delayed } = form;
</script>

<div class="bg-base-100 grid grid-cols-1 rounded-xl md:grid-cols-2">
	<div class="hero bg-base-200 min-h-full rounded-l-xl">
		<div class="hero-content py-12">
			<div class="max-w-md">
				<h1 class="text-center text-3xl font-bold">
					<!--<Img src={logoImg} class="mask mask-circle mr-2 inline-block w-12" alt="" />-->
					ByteBunker
				</h1>
			</div>
		</div>
	</div>

	<div class="px-10 py-24">
		<h2 class="mb-2 flex items-center justify-center text-2xl font-semibold">
			Einloggen
			<!--<IconYondLogo class="ml-4 inline translate-y-[1px] scale-[1.2] text-white" />-->
		</h2>
		<form method="POST" use:enhance>
			<div class="mb-8 flex flex-col gap-6">
				<div class="flex flex-col gap-2">
					<Field {form} name="username">
						<Control>
							{#snippet children({ props })}
								<Label class="label-text">Username</Label>
								<input
									{...props}
									type="text"
									bind:value={$formData.username}
									autocomplete="username"
									class="input input-bordered w-full"
								/>
							{/snippet}
						</Control>
						<TranslatedFieldErrors />
					</Field>
				</div>

				<div class="flex flex-col gap-2">
					<Field {form} name="password">
						<Control>
							{#snippet children({ props })}
								<Label class="label-text">Password</Label>
								<input
									{...props}
									type="password"
									bind:value={$formData.password}
									autocomplete="current-password"
									class="input input-bordered w-full"
								/>
							{/snippet}
						</Control>
						<TranslatedFieldErrors />
					</Field>
				</div>
			</div>
			<div class="flex flex-col items-center justify-between gap-4 md:flex-row">
				<Button color="primary" submit disabled={$submitting} loading={$delayed}>Login</Button>
			</div>
		</form>
	</div>
</div>
