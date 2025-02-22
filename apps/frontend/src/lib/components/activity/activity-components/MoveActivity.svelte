<script lang="ts">
	import type { Move, Place } from '@bytebunker/event-schema';
	import type { ActivityTypeEnum } from '@bytebunker/event-schema/extension/google';
	import type { ActivityPropsInterface } from '$lib/components/activity/ActivityPropsInterface.js';
	import { DateTime } from 'luxon';
	import LucideRoute from '~icons/lucide/route';
	import LucideArrowRight from '~icons/lucide/arrow-right';
	import { t } from 'svelte-i18n';
	import ActivityCard from '$lib/components/activity/ActivityCard.svelte';
	import { googleActivityTypeIconMap } from '$lib/components/activity/activity-components/util/googleActivityTypeIconMap.js';

	interface MoveActivity extends Move {
		origin: Place;
		target: Place;
		activityType: ActivityTypeEnum;
	}

	let props: ActivityPropsInterface<MoveActivity> = $props();
	let { activity, isFirstInGroup, isLastInGroup } = props;

	let cardSize = $state();

	let icon = $derived(
		googleActivityTypeIconMap[activity.activityType]
			? googleActivityTypeIconMap[activity.activityType]
			: LucideRoute
	);
</script>

{#snippet placeName(place: Place)}
	{#if place}
		<div class="font-bold text-nowrap text-neutral-700">
			{#if place.name}
				{place.name}
			{:else}
				{place.latitude?.toFixed(3)}, {place.longitude?.toFixed(3)}
			{/if}
		</div>
	{/if}
{/snippet}

<ActivityCard {...props} {icon}>
	<div class="flex items-center">
		{@render placeName(activity.origin)}
		<LucideArrowRight class="mx-2 text-neutral-500" />
		{@render placeName(activity.target)}
		<span class="ml-1">{$t(`activity.move.activityType.${activity.activityType}`)}</span>
	</div>
</ActivityCard>
