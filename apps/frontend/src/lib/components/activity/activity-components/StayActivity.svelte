<script lang="ts">
	import type { ASActivity } from '@bytebunker/event-schema';
	import type { ActivityPropsInterface } from '$lib/components/activity/ActivityPropsInterface.js';
	import ActivityCard from '$lib/components/activity/ActivityCard.svelte';
	import LucideBedDouble from '~icons/lucide/bed-double';
	import LucideExternalLink from '~icons/lucide/external-link';
	import { Button } from '@bytebunker/daisyui-components';
	import {
		asNumber,
		asRecord,
		asText,
		pluralize,
		safeHref,
		type Loose
	} from '$lib/components/activity/activityDataUtil.js';

	let props: ActivityPropsInterface<ASActivity> = $props();

	let activity = $derived(props.activity as Loose);
	let location = $derived(asRecord(activity.location));
	let nights = $derived(asNumber(activity.nights));
	let locationName = $derived(asText(location?.name));
	let listingUrl = $derived(safeHref(location?.listingUrl ?? activity.listingUrl));
</script>

<ActivityCard {...props} icon={LucideBedDouble} type="Event">
	<div class="flex flex-col gap-0.5">
		<span class="font-bold text-neutral-700">{asText(activity.summary) ?? 'Stay'}</span>
		<span class="text-sm text-neutral-500">
			{#if nights !== undefined}{pluralize(nights, 'night')}{/if}
			{#if locationName}{nights !== undefined ? ' · ' : ''}{locationName}{/if}
		</span>
	</div>
	{#snippet afterCardButtons()}
		{#if listingUrl}
			<Button
				btnStyle="ghost"
				class="btn-circle"
				size="sm"
				href={listingUrl}
				target="_blank"
				rel="external noopener"><LucideExternalLink /></Button
			>
		{/if}
	{/snippet}
</ActivityCard>
