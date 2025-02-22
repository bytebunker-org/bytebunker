<script lang="ts">
	import { createInfiniteQuery } from '@tanstack/svelte-query';
	import { ActivityGraphSearchApi } from '$lib/api/ActivityGraphSearchApi.js';
	import { DateTime } from 'luxon';
	import { fly } from 'svelte/transition';
	import type {
		ActivityGraphSearchRequestDto,
		ActivityGraphSearchResponseDto
	} from '@bytebunker/backend';
	import { activityComponentMap } from '$lib/components/activity/activityComponentMap.js';
	import type { ASActivity } from '@bytebunker/event-schema';
	import { throttle } from 'es-toolkit';
	import { onMount, tick } from 'svelte';
	import { browser } from '$app/environment';
	import { SvelteSet } from 'svelte/reactivity';
	import { FilterQueryUtil } from '$lib/util/filterQueryUtil.svelte.js';
	import { activityTimelineFilterDefinition } from '$lib/components/activity/activityTimelineFilterDefinition.js';
	import ActivityScrollbar from '$lib/components/activity/ActivityScrollbar.svelte';

	interface Props {
		searchRequest: ActivityGraphSearchRequestDto;
	}

	let { searchRequest }: Props = $props();

	const filter = new FilterQueryUtil(activityTimelineFilterDefinition);

	const activitySearchQuery = createInfiniteQuery<
		ActivityGraphSearchResponseDto,
		Error,
		ActivityGraphSearchResponseDto,
		['activitySearch', ActivityGraphSearchRequestDto],
		['cursorStart' | 'cursorEnd', DateTime]
	>(() => ({
		queryKey: ['activitySearch', searchRequest],
		queryFn: ({ pageParam, queryKey }) =>
			ActivityGraphSearchApi.search({
				...queryKey[1],
				...(pageParam[0] === 'cursorStart'
					? { cursorStart: pageParam[1].toISO() as unknown as DateTime }
					: {}),
				...(pageParam[0] === 'cursorEnd'
					? { cursorEnd: pageParam[1].toISO() as unknown as DateTime }
					: {})
			}),
		initialPageParam: ['cursorStart', filter.filters.start.endOf('day')],
		getPreviousPageParam: (firstPage: ActivityGraphSearchResponseDto) =>
			firstPage.hasPreviousPage ? ['cursorEnd', firstPage.previousPageEndCursor!] : undefined,
		getNextPageParam: (lastPage: ActivityGraphSearchResponseDto) =>
			lastPage.hasNextPage ? ['cursorStart', lastPage.nextPageStartCursor!] : undefined,
		staleTime: 2 * 60 * 1000,
		gcTime: 5 * 60 * 1000
	}));
	const fetchPreviousPage = throttle(() => {
		if (!activitySearchQuery.isFetchingPreviousPage) {
			lastTimelineContainerHeight = activityTimelineContainer?.getBoundingClientRect().height;
			activitySearchQuery.fetchPreviousPage();
		}
	}, 1000);

	function groupActivities(
		activities: ASActivity[]
	): { date: DateTime; activities: ASActivity[] }[] {
		const activitiesByDay = new Map<string, ASActivity[]>();

		for (const activity of activities) {
			const day = activity.startTime!.toFormat('yyyy-MM-dd');
			if (!activitiesByDay.has(day)) {
				activitiesByDay.set(day, []);
			}

			activitiesByDay.get(day)!.push(activity);
		}

		return Array.from(activitiesByDay.entries())
			.map(([date, activities]) => ({
				date: DateTime.fromISO(date),
				activities: activities.sort((a, b) => a.startTime!.diff(b.startTime!).milliseconds)
			}))
			.sort((a, b) => b.date.diff(a.date).milliseconds);
	}

	let lastTimelineContainerHeight = $state<number | undefined>(undefined);

	function _onScroll() {
		const atEndMargin = window.innerHeight * 0.5;

		const isAtBeginning = window.scrollY === 0;
		const isAtEnd = window.scrollY + window.innerHeight >= document.body.scrollHeight - atEndMargin;

		if (
			isAtBeginning &&
			activitySearchQuery.hasPreviousPage &&
			!activitySearchQuery.isFetchingPreviousPage
		) {
			window.scrollTo({ top: 1 });
			fetchPreviousPage();
		} else if (
			isAtEnd &&
			activitySearchQuery.hasNextPage &&
			!activitySearchQuery.isFetchingNextPage
		) {
			lastTimelineContainerHeight = undefined;
			activitySearchQuery.fetchNextPage();
		}
	}

	const onScroll = throttle(_onScroll, 100);
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
	$effect(() => {
		if (activityTimelineContainer && activitySearchQuery.data?.pages?.length) {
			(async () => {
				await tick();

				dayHeaderIntersectionObserver?.disconnect();

				for (const element of activityTimelineContainer
					.querySelectorAll('.timeline-day-header')
					.values()) {
					dayHeaderIntersectionObserver?.observe(element);
				}

				if (lastTimelineContainerHeight) {
					console.log(
						'lastTimelineContainerHeight',
						lastTimelineContainerHeight,
						'current',
						activityTimelineContainer.getBoundingClientRect().height
					);
					lastTimelineContainerHeight = undefined;
				}
			})();
		} else {
			dayHeaderIntersectionObserver?.disconnect();
		}
	});

	$inspect('lastTimelineContainerHeight', lastTimelineContainerHeight);

	onMount(() => {
		window.scrollTo({
			top: 1
		});
	});
</script>

<svelte:window onscroll={onScroll} />

<ActivityScrollbar {searchRequest} {currentScrollDate} />

<div bind:this={activityTimelineContainer}>
	{#each activitySearchQuery.data?.pages ?? [] as page}
		<div class="mx-auto flex w-[60vw] flex-row flex-wrap p-2" transition:fly={{ duration: 300 }}>
			{#each groupActivities(page.activities) as dayGroup (dayGroup.date.toISO())}
				<div class="mt-4">
					<div
						class="timeline-day-header from-base-100 sticky top-0 z-20 flex items-center gap-8 bg-gradient-to-b from-70% to-transparent"
						data-date={dayGroup.date.toISODate()}
					>
						<h2 class="py-4 text-xl font-bold">
							{dayGroup.date.toLocaleString(DateTime.DATE_MED_WITH_WEEKDAY)}
						</h2>
						<div class="h-[1px] w-[30vw] border-t border-t-neutral-300"></div>
					</div>
					<div class="flex flex-col gap-4 pl-16">
						{#each dayGroup.activities as activity, i (activity['@id'])}
							{@const ActivityComponent = activityComponentMap[activity['@type']]}

							{#if ActivityComponent}
								<ActivityComponent
									{activity}
									displaySize="md"
									isFirstInGroup={i === 0}
									isLastInGroup={dayGroup.activities.length - 1 === i}
								/>
							{/if}
						{/each}
					</div>
				</div>
			{/each}
		</div>
	{/each}

	<div class="flex w-full items-center justify-center p-8">
		{#if activitySearchQuery.hasNextPage}
			<span class="loading loading-ring text-primary size-16"></span>
		{:else}
			<span class="text-neutral-500">Keine weiteren Aktivitäten gefunden</span>
		{/if}
	</div>
</div>

<style>
	.timeline-day-header {
		background: rgb(255, 255, 255);
		background: linear-gradient(
			180deg,
			rgba(255, 255, 255, 0) 0%,
			rgba(255, 255, 255, 1) 15%,
			rgba(255, 255, 255, 1) 85%,
			rgba(255, 255, 255, 0) 100%
		);
	}
</style>
