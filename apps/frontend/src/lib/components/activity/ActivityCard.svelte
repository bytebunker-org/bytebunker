<script lang="ts">
	import type { ActivityPropsInterface } from '$lib/components/activity/ActivityPropsInterface.js';
	import type { ASActivity, ActivityType } from '@bytebunker/event-schema';
	import type { Component, Snippet } from 'svelte';
	import { DateTime } from 'luxon';

	interface Props extends ActivityPropsInterface<ASActivity> {
		children?: Snippet;

		type: ActivityType | string;

		icon: Component;

		maxCardHeight?: number;
	}

	let {
		activity,
		children,
		icon: Icon,
		isFirstInGroup,
		isLastInGroup,
		maxCardHeight
	}: Props = $props();

	let timelineLineHeight = $derived.by(() => {
		const height = maxCardHeight ? maxCardHeight : isLastInGroup ? 50 : 100;

		return isFirstInGroup ? height * 2 : height;
	});
</script>

<div class="flex items-center">
	<div class="w-[50px] text-neutral-500">
		{activity.startTime?.toLocaleString(DateTime.TIME_24_SIMPLE)}
	</div>
	<div class="bg-primary relative mr-4 rounded-full p-2">
		<Icon class="z-10 size-5" />
		<div
			class="absolute left-[calc(50%-1px)] z-[-1] w-[1px] border-l-2 border-neutral-300"
			style="height: {timelineLineHeight}px; top: {isFirstInGroup
				? -(timelineLineHeight / 2)
				: 0}px"
		></div>
	</div>
	<div class="card rounded-box bg-neutral-100 px-3 py-2">
		{@render children?.()}
	</div>
</div>

<div></div>
