<script lang="ts">
	import type { ASActivity } from '@bytebunker/event-schema';
	import type { ActivityPropsInterface } from '$lib/components/activity/ActivityPropsInterface.js';
	import ActivityCard from '$lib/components/activity/ActivityCard.svelte';
	import LucideSearch from '~icons/lucide/search';
	import LucideMapPin from '~icons/lucide/map-pin';
	import {
		asRecord,
		asText,
		getSearchQuery,
		getSearchSource,
		pluralize,
		truncate,
		type Loose
	} from '$lib/components/activity/activityDataUtil.js';

	const MAX_LISTED_QUERIES = 6;

	let props: ActivityPropsInterface<ASActivity> = $props();

	let searches = $derived(
		props.mergedActivities?.length ? props.mergedActivities : [props.activity]
	);
	let isMerged = $derived(searches.length > 1);
	let queries = $derived(searches.map(getSearchQuery).filter((q): q is string => !!q));
	let source = $derived(getSearchSource(props.activity));
	let locationName = $derived(asText(asRecord((props.activity as Loose).location)?.name));
</script>

<ActivityCard {...props} icon={LucideSearch} type="Search">
	<div class="flex flex-col gap-0.5">
		{#if isMerged}
			<span class="font-bold text-neutral-700"
				>{pluralize(searches.length, 'search', 'searches')}</span
			>
			<ul class="text-sm text-neutral-600">
				{#each queries.slice(0, MAX_LISTED_QUERIES) as query, i (i)}
					<li class="max-w-[60vw] truncate lg:max-w-[30vw]" title={query}>{truncate(query, 80)}</li>
				{/each}
			</ul>
			{#if queries.length > MAX_LISTED_QUERIES}
				<span class="text-sm text-neutral-400">+{queries.length - MAX_LISTED_QUERIES} more</span>
			{/if}
		{:else}
			<span
				class="max-w-[60vw] truncate font-bold text-neutral-700 lg:max-w-[30vw]"
				title={queries[0]}
			>
				{queries[0] ? truncate(queries[0], 120) : 'Search'}
			</span>
			<span class="flex items-center gap-2 text-sm text-neutral-500">
				{#if source}<span>{source}</span>{/if}
				{#if locationName}
					<span class="flex items-center gap-1"
						><LucideMapPin class="size-3.5" />{locationName}</span
					>
				{/if}
			</span>
		{/if}
	</div>
</ActivityCard>
