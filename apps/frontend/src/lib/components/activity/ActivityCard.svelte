<script lang="ts">
	import type { ActivityPropsInterface } from '$lib/components/activity/ActivityPropsInterface.js';
	import type { ASActivity, ActivityType } from '@bytebunker/event-schema';
	import type { Component, Snippet } from 'svelte';
	import { DateTime } from 'luxon';
	import ActivitySummary from '$lib/components/activity/ActivitySummary.svelte';
	import LucideCornerDownRight from '~icons/lucide/corner-down-right';
	import { getActivityTypeData } from '$lib/components/activity/activityTypeRegistry.js';
	import type { ClassValue } from 'svelte/elements';

	interface Props extends ActivityPropsInterface<ASActivity> {
		children?: Snippet;

		class?: ClassValue;

		type: ActivityType | string;

		icon: Component;

		maxCardHeight?: number;

		noCardStyles?: boolean;

		hideIcon?: boolean;

		afterCardButtons?: Snippet;
	}

	let {
		activity,
		class: classes = [],
		type,
		cardSize,
		nestedActivities,
		children,
		icon: Icon,
		isFirstInGroup,
		isLastInGroup,
		maxCardHeight,
		noCardStyles,
		hideIcon = false,
		afterCardButtons
	}: Props = $props();

	let activityTypeData = $derived(getActivityTypeData((type as ActivityType) ?? activity['@type']));

	let timelineLineHeight = $derived.by(() => {
		const height = maxCardHeight ? maxCardHeight : isLastInGroup ? 50 : 100;

		return isFirstInGroup ? height * 2 : height;
	});
</script>

<div
	class={[
		'group/activity-card flex items-center',
		cardSize === 'sm' ? 'my-[-5px]' : 'my-1',
		...(Array.isArray(classes) ? classes : [classes])
	]}
	style="--activity-bg-color: {activityTypeData.backgroundColor}; --activity-fg-color: {activityTypeData.color}"
>
	<div class="mr-2 w-[50px] text-right text-neutral-500 {cardSize === 'sm' ? 'text-sm' : ''}">
		{activity.startTime?.toLocaleString(DateTime.TIME_24_SIMPLE)}
	</div>
	{#if !hideIcon}
		<div class="relative mr-4 size-9">
			<div
				class={[
					'absolute top-[50%] left-[50%] translate-[-50%] rounded-full',
					cardSize === 'sm'
						? 'bg-base-200 size-7 p-[5px] text-neutral-500'
						: 'activity-card-icon size-9 p-[7px]'
				]}
			>
				<Icon class="h-full w-full" />
			</div>
			<div
				class="absolute left-[calc(50%-1px)] z-[-1] w-[1px] border-l-2 border-neutral-300"
				style="height: {timelineLineHeight}px; top: {isFirstInGroup || timelineLineHeight > 400
					? -(timelineLineHeight / 2)
					: 0}px"
			></div>
		</div>
	{/if}
	<div class={['flex', cardSize === 'sm' ? 'items-center' : 'flex-col']}>
		<div
			class={noCardStyles
				? []
				: [
						'card rounded-box',
						{
							'rounded-b-none': nestedActivities.length,
							'bg-neutral-50 px-2 py-1 text-sm !text-neutral-600': cardSize === 'sm',
							'bg-neutral-100 px-3 py-2': cardSize === 'md',
							'bg-neutral-200 px-4 py-3': cardSize === 'lg'
						}
					]}
		>
			{@render children?.()}
		</div>
		{#if nestedActivities.length}
			{#if cardSize === 'md' || cardSize === 'lg'}
				<div
					class={[
						'rounded-b-box flex items-center gap-1  px-2 py-1 text-sm text-neutral-500',
						cardSize === 'lg' ? 'bg-neutral-100' : 'bg-neutral-50'
					]}
				>
					<LucideCornerDownRight class="size-[15px]" />
					<ActivitySummary activities={nestedActivities} />
				</div>
			{:else}
				<LucideCornerDownRight class="size-[10px]" /><span class="text-sm text-neutral-400"
					>{nestedActivities.length}</span
				>
			{/if}
		{/if}
	</div>
	{#if afterCardButtons}
		<div
			class="ml-2 opacity-0 transition-opacity duration-150 group-hover/activity-card:opacity-100"
		>
			{@render afterCardButtons?.()}
		</div>
	{/if}
</div>

<style>
	.activity-card-icon {
		background: linear-gradient(200deg, rgba(255, 255, 255, 0.4), transparent 100%),
			linear-gradient(0deg, var(--activity-bg-color), var(--activity-bg-color));
		color: var(--activity-fg-color);
	}
</style>
