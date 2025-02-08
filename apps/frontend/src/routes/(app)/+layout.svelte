<script lang="ts">
	import { setUserContext } from '$lib/context.js';
	import type { LayoutProps } from './$types';
	import { afterNavigate, beforeNavigate } from '$app/navigation';

	let { data, children }: LayoutProps = $props();
	setUserContext(data.user);

	// Used for playwright testing
	beforeNavigate(() => {
		window.testingNavigationState = 'during-navigation';
	});

	afterNavigate(() => {
		window.testingNavigationState = 'finished-navigation';
	});
</script>

{@render children()}
