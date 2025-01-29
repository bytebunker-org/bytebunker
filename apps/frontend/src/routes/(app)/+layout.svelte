<script lang="ts">
	import MainMenu from '$lib/components/MainMenu.svelte';
	import { setUserContext } from '$lib/context.js';
	import type { LayoutProps } from './$types';
	import LucideEllipsisVertical from '~icons/lucide/ellipsis-vertical';
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

<div class="hidden min-h-screen flex-row md:flex">
	<aside class="fixed min-h-screen w-64 2xl:w-80">
		<MainMenu />
	</aside>
	<main class="ml-64 w-full px-4 pt-12 2xl:ml-80">
		{@render children()}
	</main>
</div>

<div class="drawer drawer-end md:hidden">
	<input id="main-drawer" type="checkbox" class="drawer-toggle" />

	<div class="drawer-content min-h-screen">
		<label
			for="main-drawer"
			class="fixed top-4 right-4 z-50 block cursor-pointer rounded-lg border border-neutral-700 bg-neutral-900 p-2"
		>
			<LucideEllipsisVertical class="size-6 text-white" />
		</label>

		<main class="w-full px-4 pt-12 lg:px-8">
			{@render children()}
		</main>
	</div>

	<div class="drawer-side">
		<label for="main-drawer" aria-label="close sidebar" class="drawer-overlay" />
		<div class="min-h-full w-80 bg-neutral-900 p-4">
			<MainMenu />
		</div>
	</div>
</div>
