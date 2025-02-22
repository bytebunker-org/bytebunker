<script lang="ts">
	import type {
		ActivityGraphSearchRequestDto,
		ActivityGraphSearchCountRequestDto,
		ActivityGraphSearchCountResponseDto
	} from '@bytebunker/backend';
	import { createQuery } from '@tanstack/svelte-query';
	import { ActivityGraphSearchApi } from '$lib/api/ActivityGraphSearchApi.js';
	import { DateTime } from 'luxon';
	import { mapRange, range } from '$lib/util/util.js';

	interface Props {
		searchRequest: ActivityGraphSearchRequestDto;

		currentScrollDate: DateTime | undefined;
	}

	let { searchRequest, currentScrollDate }: Props = $props();

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
	let highestCount = $derived(Math.max(...data?.map((d) => d.count)));

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
</script>

<svelte:window bind:innerHeight />

<div class="fixed top-0 right-0 bottom-0 flex flex-col" style="width: {maxBarWidth}px">
	{#if data && earliestYear && latestYear}
		{#each range(earliestYear, latestYear + 1) as year}
			{@const height = calculateHeight(DateTime.fromObject({ year }))}
			<div class="bg-base-100/70 fixed right-1 z-20 p-[1px] text-right" style="top: {height}px">
				{year}
			</div>
		{/each}
		{#each data as { date, count }}
			{@const height = calculateHeight(date)}
			{@const width = mapRange(count, 0, highestCount, 0, maxBarWidth)}
			<div
				class="fixed right-1 h-[1px] bg-neutral-400 text-right"
				style="top: {height}px; width: {width}px"
			></div>
		{/each}

		{#if currentScrollDate}
			{@const height = calculateHeight(currentScrollDate)}
			<div
				class="bg-primary fixed right-1 z-10 h-[2px] text-right"
				style="top: {height}px; width: {maxBarWidth}px"
			></div>
		{/if}
	{/if}
</div>
