<script lang="ts">
	import type { Arrive, Place } from '@bytebunker/event-schema';
	import type { ActivityPropsInterface } from '$lib/components/activity/ActivityPropsInterface.js';
	import LucideMapPin from '~icons/lucide/map-pin';
	import { t } from 'svelte-i18n';
	import ActivityCard from '$lib/components/activity/ActivityCard.svelte';

	interface ArriveActivity extends Arrive {
		target: Place;
	}

	let props: ActivityPropsInterface<ArriveActivity> = $props();
	let { activity } = props;
</script>

{#snippet placeName(place: Place)}
	{#if place}
		<span class="px-1 font-bold text-nowrap text-neutral-700">
			{#if place.name}
				{place.name}
			{:else}
				{place.latitude?.toFixed(3)}, {place.longitude?.toFixed(3)}
			{/if}
		</span>
	{/if}
{/snippet}

<ActivityCard {...props} icon={LucideMapPin}>
	<div class="flex items-center">
		Bei {@render placeName(activity.target)} angekommen
	</div>
</ActivityCard>
