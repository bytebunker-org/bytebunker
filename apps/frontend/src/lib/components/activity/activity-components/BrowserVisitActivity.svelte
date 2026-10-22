<script lang="ts">
	import type { ASActivity } from '@bytebunker/event-schema';
	import type { ActivityPropsInterface } from '$lib/components/activity/ActivityPropsInterface.js';
	import ActivityCard from '$lib/components/activity/ActivityCard.svelte';
	import LucideGlobe from '~icons/lucide/globe';
	import LucideExternalLink from '~icons/lucide/external-link';
	import { Button } from '@bytebunker/daisyui-components';
	import {
		asRecord,
		asText,
		getHostname,
		getVisitUrl,
		pluralize,
		safeHref,
		summarizeBrowserVisits,
		truncate,
		type Loose
	} from '$lib/components/activity/activityDataUtil.js';

	const MAX_DOMAINS = 5;

	let props: ActivityPropsInterface<ASActivity> = $props();

	let visits = $derived(props.mergedActivities?.length ? props.mergedActivities : [props.activity]);
	let isMerged = $derived(visits.length > 1);
	let summary = $derived(summarizeBrowserVisits(visits));

	let page = $derived(asRecord(props.activity.object));
	let title = $derived(asText(page?.name));
	let description = $derived(asText(page?.description));
	let host = $derived(getHostname(page?.pageUrl));
	let href = $derived(safeHref(getVisitUrl(props.activity)));
	let browser = $derived(asText((props.activity as Loose).browser));
</script>

<ActivityCard {...props} icon={LucideGlobe} type="View">
	<div class="flex flex-col gap-0.5">
		{#if isMerged}
			<span class="font-bold text-neutral-700">{pluralize(summary.total, 'page visit')}</span>
			<span class="flex max-w-[70vw] flex-wrap gap-x-2 text-sm text-neutral-600 lg:max-w-[30vw]">
				{#each summary.domains.slice(0, MAX_DOMAINS) as domain (domain.host)}
					<span>{domain.host}<span class="text-neutral-400"> ×{domain.count}</span></span>
				{/each}
				{#if summary.domains.length > MAX_DOMAINS}
					<span class="text-neutral-400">+{summary.domains.length - MAX_DOMAINS} more</span>
				{/if}
			</span>
			{#each summary.topTitles as topTitle (topTitle)}
				<span
					class="max-w-[70vw] truncate text-sm text-neutral-500 lg:max-w-[30vw]"
					title={topTitle}>{truncate(topTitle, 80)}</span
				>
			{/each}
		{:else}
			<span class="max-w-[70vw] truncate font-bold text-neutral-700 lg:max-w-[30vw]" {title}>
				{title ?? host ?? 'Page visit'}
			</span>
			<span class="text-sm text-neutral-500">
				{host ?? ''}{browser ? ` · ${browser}` : ''}
			</span>
			{#if description}
				<span class="max-w-[70vw] truncate text-sm text-neutral-400 lg:max-w-[30vw]"
					>{truncate(description, 100)}</span
				>
			{/if}
		{/if}
	</div>
	{#snippet afterCardButtons()}
		{#if href && !isMerged}
			<Button
				btnStyle="ghost"
				class="btn-circle"
				size="sm"
				{href}
				target="_blank"
				rel="external noopener"><LucideExternalLink /></Button
			>
		{/if}
	{/snippet}
</ActivityCard>
