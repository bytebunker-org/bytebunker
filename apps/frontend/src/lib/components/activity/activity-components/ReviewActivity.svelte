<script lang="ts">
	import type { ASActivity } from '@bytebunker/event-schema';
	import type { ActivityPropsInterface } from '$lib/components/activity/ActivityPropsInterface.js';
	import ActivityCard from '$lib/components/activity/ActivityCard.svelte';
	import LucideStar from '~icons/lucide/star';
	import {
		asNumber,
		asRecord,
		asText,
		truncate,
		type Loose
	} from '$lib/components/activity/activityDataUtil.js';

	let props: ActivityPropsInterface<ASActivity> = $props();

	let activity = $derived(props.activity as Loose);
	let rating = $derived(asNumber(activity.rating));
	let targetName = $derived(asText(asRecord(activity.target)?.name));
	let content = $derived(asText(asRecord(activity.object)?.content));
</script>

<ActivityCard {...props} icon={LucideStar} type="Create">
	<div class="flex flex-col gap-0.5">
		<span class="font-bold text-neutral-700">
			Reviewed {targetName ?? 'a place'}
		</span>
		{#if rating !== undefined}
			<span class="flex items-center gap-0.5 text-amber-500" title="{rating} / 5">
				{#each [1, 2, 3, 4, 5] as star (star)}
					<LucideStar
						class={['size-3.5', star <= Math.round(rating) ? 'fill-current' : 'opacity-30']}
					/>
				{/each}
			</span>
		{/if}
		{#if content}
			<span class="max-w-[70vw] text-sm break-words text-neutral-600 lg:max-w-[30vw]"
				>{truncate(content, 240)}</span
			>
		{/if}
	</div>
</ActivityCard>
