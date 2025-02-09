<script lang="ts">
	import '$lib/css/app.css';
	import { LOCALE_CONTEXT_KEY } from '$lib/context.js';
	import { setContext } from 'svelte';
	import type { LayoutProps } from './$types';
	import { QueryClientProvider } from '@tanstack/svelte-query';
	import ToastContainer from '$lib/util/ToastContainer.svelte';
	import { onNavigate } from '$app/navigation';
	import ModalContainer from '$lib/components/modal/ModalContainer.svelte';

	let { data, children }: LayoutProps = $props();

	setContext(LOCALE_CONTEXT_KEY, data.language);

	onNavigate((navigation) => {
		if (!document.startViewTransition) {
			return;
		}

		return new Promise((resolve) => {
			document.startViewTransition!(async () => {
				resolve();
				await navigation.complete;
			});
		});
	});
</script>

<QueryClientProvider client={data.queryClient}>
	<ModalContainer>
		{@render children()}
	</ModalContainer>
</QueryClientProvider>
<ToastContainer />
