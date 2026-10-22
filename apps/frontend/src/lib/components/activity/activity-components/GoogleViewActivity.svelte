<script lang="ts">
	import type { ASActivity } from '@bytebunker/event-schema';
	import type { ActivityPropsInterface } from '$lib/components/activity/ActivityPropsInterface.js';
	import ActivityCard from '$lib/components/activity/ActivityCard.svelte';
	import LucideEye from '~icons/lucide/eye';
	import { asRecord, asText, type Loose } from '$lib/components/activity/activityDataUtil.js';

	let props: ActivityPropsInterface<ASActivity> = $props();

	let activity = $derived(props.activity as Loose);
	let title = $derived(asText(asRecord(activity.object)?.name));
	// Google My Activity prefixes the entry with an action text such as "Viewed" or "Watched"
	let action = $derived(asText(activity.action) ?? 'Viewed');
	let product = $derived(asText(activity.product));
</script>

<ActivityCard {...props} icon={LucideEye} type="View">
	<div class="flex flex-col gap-0.5">
		<span class="flex items-center text-nowrap">
			{action}
			{#if title}
				<span class="max-w-[40vw] truncate px-1 font-bold text-neutral-700">{title}</span>
			{:else}
				<span class="px-1">{asText(activity.summary) ?? 'something'}</span>
			{/if}
		</span>
		{#if product}<span class="text-sm text-neutral-500">{product}</span>{/if}
	</div>
</ActivityCard>
