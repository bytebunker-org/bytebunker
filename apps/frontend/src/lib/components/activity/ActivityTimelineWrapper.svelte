<script lang="ts">
	import { useQueryClient } from '@tanstack/svelte-query';
	import { DateTime } from 'luxon';
	import type { ActivityGraphSearchRequestDto } from '@bytebunker/backend';
	import { throttle } from 'es-toolkit';
	import { onMount, tick } from 'svelte';
	import { browser } from '$app/environment';
	import { SvelteSet } from 'svelte/reactivity';
	import { FilterQueryUtil } from '$lib/util/filterQueryUtil.svelte.js';
	import { activityTimelineFilterDefinition } from '$lib/components/activity/activityTimelineFilterDefinition.js';
	import ActivityScrollbar from '$lib/components/activity/ActivityScrollbar.svelte';
	import ActivityTimeline from '$lib/components/activity/ActivityTimeline.svelte';

	interface Props {
		searchRequest: ActivityGraphSearchRequestDto;
	}

	let { searchRequest }: Props = $props();

	const filter = new FilterQueryUtil(activityTimelineFilterDefinition);
	const queryClient = useQueryClient();
	let showTimeline = $state(true);

	async function jumpToDate(startDate: DateTime): Promise<void> {
		await queryClient.invalidateQueries(
			{
				queryKey: ['activitySearch']
			},
			{ cancelRefetch: true }
		);

		location.href = filter.buildFilterUrl({
			start: startDate
		});
	}
	let intersectingHeaders = new SvelteSet<HTMLDivElement>();
	let newestDateIntersectingHeader = $derived(
		Array.from(intersectingHeaders).sort(
			(a, b) =>
				DateTime.fromISO(b.dataset.date ?? '').diff(DateTime.fromISO(a.dataset.date ?? ''))
					.milliseconds
		)[0]
	);

	const dayHeaderIntersectionObserver = browser
		? new IntersectionObserver((entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) {
						intersectingHeaders.add(entry.target as HTMLDivElement);
					} else {
						intersectingHeaders.delete(entry.target as HTMLDivElement);
					}
				}

				console.log('intersectingHeaders', intersectingHeaders.size);
			})
		: undefined;

	const updateDateCursorFilter = throttle(
		(date) =>
			filter.applyFilter({ start: date }, { replaceState: true, keepFocus: true, noScroll: true }),
		1000
	);

	let currentScrollDate = $derived.by(() => {
		const dateString = newestDateIntersectingHeader?.dataset.date;
		const date = dateString ? DateTime.fromISO(dateString) : undefined;

		return date?.isValid ? date : undefined;
	});

	$effect(() => {
		if (currentScrollDate) {
			updateDateCursorFilter(currentScrollDate);
		}
	});

	let activityTimelineContainer = $state<HTMLDivElement | undefined>();

	function _onScroll() {
		dayHeaderIntersectionObserver?.disconnect();

		for (const element of activityTimelineContainer
			?.querySelectorAll('.timeline-day-header')
			.values() ?? []) {
			dayHeaderIntersectionObserver?.observe(element);
		}
	}

	const onScroll = throttle(_onScroll, 250);

	onMount(() => {
		window.scrollTo({
			top: 1
		});
	});
</script>

<svelte:window onscroll={onScroll} />

<ActivityScrollbar {searchRequest} {currentScrollDate} {jumpToDate} />

<div bind:this={activityTimelineContainer}>
	{#if showTimeline}
		<ActivityTimeline
			{searchRequest}
			{filter}
			initialPageParam={['cursorStart', filter.filters.start.endOf('day')]}
		/>
	{/if}
</div>
