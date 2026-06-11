<script lang="ts">
	import type { ASActivity } from '@bytebunker/event-schema';
	import { DateTime } from 'luxon';
	import LucideSquareActivity from '~icons/lucide/square-activity';
	import LucideChevronDown from '~icons/lucide/chevron-down';
	import LucideChevronUp from '~icons/lucide/chevron-up';
	import ActivitySummary from '$lib/components/activity/ActivitySummary.svelte';
	import { getActivityTypeData } from '$lib/components/activity/activityTypeRegistry.js';
	import { Button } from '@bytebunker/daisyui-components';
	import { slide } from 'svelte/transition';

	interface Props {
		activities: ASActivity[];

		index: number;

		isFirstInGroup: boolean;

		isLastInGroup: boolean;
	}

	let isExpanded = $state(false);

	let { activities, index, isFirstInGroup, isLastInGroup }: Props = $props();
	let timelineLineHeight = $derived.by(() => {
		const height = isExpanded ? activities.length * 50 : isLastInGroup ? 50 : 100;

		return isFirstInGroup ? height * 2 : height;
	});

	let isSingleType = $derived(new Set(activities.map((a) => a['@type'])).size === 1);
	let firstTypeData = getActivityTypeData(activities[0]['@type']);

	let Icon = $derived(isSingleType ? firstTypeData.defaultIcon : LucideSquareActivity);
</script>

{#if isSingleType && firstTypeData.componentSupportsMergedSize}
	{@const ActivityComponent = firstTypeData.component}
	<ActivityComponent
		cardSize="merged"
		activity={activities[0]}
		mergedActivities={activities}
		nestedActivities={[]}
		{index}
		{isFirstInGroup}
		{isLastInGroup}
	/>
{:else}
	<div
		class="group relative flex"
		style="--activity-bg-color: {isSingleType
			? firstTypeData.backgroundColor
			: 'var(--color-neutral-400)'}; --activity-fg-color: {isSingleType
			? firstTypeData.color
			: 'white'}"
	>
		<div class="mt-[6px] -mr-[4px] w-[50px] text-neutral-500 lg:ml-[12px]">
			{activities[0].startTime?.toLocaleString(DateTime.TIME_24_SIMPLE)}
		</div>
		<div
			class="activity-card-icon rounded-box relative mr-4 size-9 cursor-pointer p-2"
			onclick={() => (isExpanded = !isExpanded)}
			tabindex="0"
			onkeydown={() => (isExpanded = !isExpanded)}
			role="button"
		>
			<Icon class="z-10 size-5" />
			<div
				class="absolute left-[calc(50%-1px)] z-[-1] w-[1px] border-l-2 border-neutral-300"
				style="height: {timelineLineHeight}px; top: {isFirstInGroup
					? -(timelineLineHeight / 2)
					: 0}px"
			></div>
		</div>
		<div class="relative">
			{#if isExpanded}
				<div class="flex flex-col gap-4 overflow-hidden py-2" transition:slide>
					{#each activities as activity, i (activity['@id'])}
						{@const activityTypeData = getActivityTypeData(activity['@type'])}
						{@const ActivityComponent = activityTypeData.component}

						{#if ActivityComponent}
							<ActivityComponent
								{activity}
								nestedActivities={[]}
								cardSize="sm"
								index={i}
								isFirstInGroup={i === 0}
								isLastInGroup={activities.length - 1 === i}
								hideIcon
							/>
						{/if}
					{/each}
				</div>
			{:else}
				<div class="card rounded-box absolute bg-neutral-50 px-3 py-2 text-sm text-neutral-600">
					<ActivitySummary {activities} hideIcon />
				</div>
			{/if}
		</div>
		<Button
			btnStyle="outline"
			color="primary"
			onclick={(e) => {
				e.preventDefault();
				e.stopPropagation();
				isExpanded = !isExpanded;
			}}
			class="btn-circle absolute top-0 {!isExpanded
				? 'right-[-10%] opacity-0'
				: 'right-0'} transition-opacity duration-100 group-hover:opacity-100"
		>
			{#if isExpanded}
				<LucideChevronUp class="size-6" />
			{:else}
				<LucideChevronDown class="size-6" />
			{/if}
		</Button>
	</div>
{/if}

<style>
	.activity-card-icon {
		background:
			linear-gradient(200deg, rgba(255, 255, 255, 0.4), transparent 100%),
			linear-gradient(0deg, var(--activity-bg-color), var(--activity-bg-color));
		color: var(--activity-fg-color);
	}
</style>
