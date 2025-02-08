<script lang="ts">
	import type { Component, Snippet } from 'svelte';
	import LucideEllipsisVertical from '~icons/lucide/ellipsis-vertical';
	import { Button, Breadcrumb, BreadcrumbItem } from '@bytebunker/daisyui-components';
	import MainMenu from '$lib/components/MainMenu.svelte';

	interface Props {
		children: Snippet;

		toolbar?: Snippet;

		title: string;

		icon: Component;

		/**
		 * An array of [title, href] tuples. Only include the previous page in the array and not the homepage
		 */
		breadcrumbs?: [string, string][];

		isHome?: boolean;
	}

	let { children, toolbar, title, icon: Icon, breadcrumbs, isHome }: Props = $props();
</script>

<svelte:head>
	<title>{title}</title>
</svelte:head>

<div class="hidden min-h-screen flex-row md:flex">
	<aside class="min-h-screen min-w-64 2xl:min-w-80">
		<div class="fixed min-h-screen min-w-64 2xl:min-w-80" style="view-transition-name: main-menu">
			<MainMenu />
		</div>
	</aside>
	<main class="w-full px-8 pt-4 xl:px-16">
		{#if !isHome}
			<div style="view-transition-name: breadcrumb">
				<Breadcrumb class="mb-6 hidden pt-0 text-sm lg:block">
					<BreadcrumbItem href="/">Home</BreadcrumbItem>

					{#if breadcrumbs}
						{#each breadcrumbs as [title, href], i}
							<BreadcrumbItem {href}>
								{title}
							</BreadcrumbItem>
						{/each}
					{/if}

					<BreadcrumbItem class="text-neutral-500">
						{title}
					</BreadcrumbItem>
				</Breadcrumb>
			</div>
		{/if}

		<div class="mb-6 flex items-center justify-between">
			<h1 class="font-stratos flex items-center gap-2 text-2xl font-bold">
				<Icon />
				{title}
			</h1>
			{#if toolbar}
				<div class="card border border-neutral-200 shadow">
					{@render toolbar()}
				</div>
			{/if}
		</div>
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
		<label for="main-drawer" aria-label="close sidebar" class="drawer-overlay"></label>
		<div class="min-h-full w-80 bg-neutral-900 p-4">
			<MainMenu />
		</div>
	</div>
</div>
