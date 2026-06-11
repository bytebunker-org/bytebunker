<script lang="ts">
	import type { ASActivity } from '@bytebunker/event-schema';
	import { groupByKey } from '$lib/util/util.js';
	import { getActivityTypeData } from '$lib/components/activity/activityTypeRegistry.js';

	interface Props {
		activities: ASActivity[];

		hideIcon?: boolean;
	}

	let { activities, hideIcon = false }: Props = $props();

	let groupedByType = $derived(groupByKey(activities, '@type'));
	let groupAmounts = $derived(Object.keys(groupedByType).length);
	let isSingleType = $derived(groupAmounts === 1);

	function summarize(activities: ASActivity[]) {
		const activityType = activities[0]['@type'];
		const activityTypeData = getActivityTypeData(activityType);

		if (activityTypeData?.summarizeMultiple) {
			return activityTypeData?.summarizeMultiple(activities);
		} else if (activityTypeData?.summarize) {
			return activities.map((a) => activityTypeData.summarize!(a)).join(', ');
		} else {
			return `${activities.length}x ${activityType}`;
		}
	}

	let completeSummary = $derived(
		isSingleType
			? summarize(activities)
			: Object.values(groupedByType)
					.map((a) => summarize(a))
					.join(', ')
	);
</script>

<div title={completeSummary}>
	{#each Object.entries(groupedByType) as [type, activities], i}
		{@const Icon = getActivityTypeData(type).defaultIcon}

		<div class="flex flex-nowrap items-center gap-1 text-nowrap">
			{#if isSingleType}
				{#if Icon && !hideIcon}<Icon />{/if}<span
					class="max-w-[65vw] overflow-hidden overflow-ellipsis lg:max-w-[30vw]"
					>{summarize(activities)}</span
				>
			{:else}
				>{#if Icon && !hideIcon}<Icon />{/if}<span
					class="max-w-[30vw] overflow-hidden overflow-ellipsis"
					>{summarize(activities)}{i !== groupAmounts - 1 ? ', ' : ''}</span
				>
			{/if}
		</div>
	{/each}
</div>
