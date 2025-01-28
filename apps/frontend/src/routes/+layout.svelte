<script lang="ts">
	import '../css/app.css';
	import { LOCALE_CONTEXT_KEY } from '$lib/context.js';
	import { setContext } from 'svelte';
	import type { LayoutProps } from './$types';
	import { QueryClientProvider } from '@tanstack/svelte-query';
	import ToastContainer from '$lib/util/ToastContainer.svelte';

	let { data, children }: LayoutProps = $props();

	setContext(LOCALE_CONTEXT_KEY, data.language);
</script>

<QueryClientProvider client={data.queryClient}>
	{@render children()}
</QueryClientProvider>
<ToastContainer />
