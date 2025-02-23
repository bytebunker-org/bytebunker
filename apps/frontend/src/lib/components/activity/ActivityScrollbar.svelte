<script lang="ts">
	import type {
		ActivityGraphSearchRequestDto,
		ActivityGraphSearchCountRequestDto
	} from '@bytebunker/backend';
	import { createQuery } from '@tanstack/svelte-query';
	import { ActivityGraphSearchApi } from '$lib/api/ActivityGraphSearchApi.js';
	import { DateTime } from 'luxon';
	import { mapRange, range } from '$lib/util/util.js';
	import { fly } from 'svelte/transition';
	import LucideChevronRight from '~icons/lucide/chevron-right';

	interface Props {
		searchRequest: ActivityGraphSearchRequestDto;

		currentScrollDate: DateTime | undefined;

		jumpToDate: (startDate: DateTime) => Promise<void>;
	}

	let { searchRequest, currentScrollDate, jumpToDate }: Props = $props();

	const activityCountQuery = createQuery(() => ({
		queryKey: [
			'activitySearch',
			'count',
			{
				...searchRequest,
				startCursor: undefined,
				endCursor: undefined
			} as ActivityGraphSearchCountRequestDto
		],
		queryFn: ({ queryKey }) => ActivityGraphSearchApi.count(queryKey[2]),
		staleTime: 2 * 60 * 1000,
		gcTime: 5 * 60 * 1000,
		select: (data) =>
			data.groupedCount.map((e) => ({ date: DateTime.fromISO(e.date), count: e.count }))
	}));
	let data = $derived(activityCountQuery.data);

	const paddingY = 30;
	const maxBarWidth = 100;

	let innerHeight = $state(0);
	let earliestYear = $derived(data?.at(-1)?.date.year);
	let latestYear = $derived(data?.at(0)?.date.year);
	let highestCount = $derived(Math.max(0, ...(data?.map((d) => d.count) ?? [])));

	let earliestMillis = $derived(
		DateTime.fromObject({ year: earliestYear }).startOf('year').toMillis()
	);
	let latestMillis = $derived(DateTime.fromObject({ year: latestYear }).endOf('year').toMillis());

	// Normalize date from millis to the range 0-1
	function normalizeDate(date: DateTime): number {
		return mapRange(date.toMillis(), latestMillis, earliestMillis, 0, 1);
	}

	function calculateHeight(date: DateTime): number {
		const normalizedPaddingY = paddingY / innerHeight;

		const paddedNormalizedValue = mapRange(
			normalizeDate(date),
			0,
			1,
			normalizedPaddingY,
			1 - normalizedPaddingY
		);

		return paddedNormalizedValue * innerHeight;
	}

	function calculateDateFromHeight(height: number): DateTime {
		const heightWithoutPadding = mapRange(height, paddingY, innerHeight - paddingY, 0, innerHeight);

		return DateTime.fromMillis(
			mapRange(heightWithoutPadding, innerHeight, 0, earliestMillis, latestMillis)
		);
	}

	async function onClick(event: MouseEvent) {
		await jumpToDate(calculateDateFromHeight(event.y));
	}

	let mouseY = $state(0);
	let hoveredDate = $derived(calculateDateFromHeight(mouseY));
	let animationFrameId: number | undefined = undefined;

	function onMouseMove(event: MouseEvent) {
		if (animationFrameId) {
			cancelAnimationFrame(animationFrameId);
		}

		animationFrameId = requestAnimationFrame(() => {
			mouseY = event.y;
		});
	}
</script>

<svelte:window bind:innerHeight />

{#if data && earliestYear && latestYear}
	<div
		class="group fixed top-0 right-0 bottom-0 z-30 flex cursor-row-resize flex-col"
		style="width: {maxBarWidth}px"
		in:fly={{ duration: 300, x: 50 }}
		onclick={onClick}
		onmousemove={onMouseMove}
	>
		<div
			class="jump-tooltip bg-primary rounded-box absolute z-20 scale-0 px-2 text-nowrap transition-transform duration-100 group-hover:scale-100"
			style="top: calc({mouseY}px - (26px / 2)); right: calc({maxBarWidth}px + 10px)"
		>
			Jump to <span class="font-mono">{hoveredDate.monthShort}</span>
			<span class="font-mono">{hoveredDate.year}</span>
		</div>
		{#each range(earliestYear, latestYear + 1) as year}
			{@const height = calculateHeight(DateTime.fromObject({ year }))}
			<div
				class="bg-base-100/70 absolute right-1 z-20 p-[1px] text-right"
				style="top: calc({height}px - (26px / 2))"
			>
				{year}
			</div>
		{/each}
		{#each data as { date, count }}
			{@const height = calculateHeight(date)}
			{@const width = mapRange(count, 0, highestCount, 0, maxBarWidth)}
			<div
				class="absolute right-1 h-[1px] bg-neutral-400 text-right"
				style="top: {height}px; width: {width}px"
			></div>
		{/each}

		{#if currentScrollDate}
			{@const height = calculateHeight(currentScrollDate)}
			<div class="absolute right-1 z-10 h-[2px] text-right" style="top: {height}px">
				<div class="bg-primary z-10 h-[2px] text-right" style="width: {maxBarWidth + 5}px"></div>
				<div class="absolute top-[-7px] z-10" style="left: -15px">
					<LucideChevronRight class="text-primary-content size-[15px]" />
				</div>
			</div>
		{/if}
	</div>
{/if}

<style>
	.jump-tooltip:after {
		--tooltip-height: 10px;
		--arrow-height: 10px;

		content: '';
		position: absolute;
		top: 4px;
		right: 0;
		transform: translate(100%, calc(var(--arrow-height) / 2));
		width: 0;
		height: 0;
		border-top: calc(var(--arrow-height) / 2) solid transparent;
		border-left: calc(var(--arrow-height)) solid var(--color-primary);
		border-bottom: calc(var(--arrow-height) / 2) solid transparent;
	}
</style>
