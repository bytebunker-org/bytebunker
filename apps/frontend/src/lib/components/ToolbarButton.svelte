<script lang="ts">
	import type { Component } from 'svelte';
	import type { ClassValue, HTMLAttributes } from 'svelte/elements';

	interface Props extends HTMLAttributes<HTMLButtonElement | HTMLAnchorElement> {
		icon: Component;

		tooltip: string;

		href?: string;

		class?: string;

		iconClass?: ClassValue;

		loading?: boolean;
	}

	let {
		icon: Icon,
		tooltip,
		href,
		class: className,
		iconClass,
		loading = false,
		...restProps
	}: Props = $props();
</script>

<div class="tooltip tooltip-bottom" data-tip={tooltip}>
	{#snippet inner()}
		{#if loading}
			<div class="flex h-full w-full items-center justify-center">
				<span class="loading loading-spinner loading-md"></span>
			</div>
		{:else}
			<Icon class="size-6 {iconClass}" />
		{/if}
	{/snippet}
	{#if href}
		<a class="btn btn-ghost btn-circle rounded-box p-0 {className}" {href} {...restProps}>
			{@render inner()}
		</a>
	{:else}
		<button class="btn btn-ghost btn-circle rounded-box p-0 {className}" {...restProps}>
			{@render inner()}
		</button>
	{/if}
</div>
