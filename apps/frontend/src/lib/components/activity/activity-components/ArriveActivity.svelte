<script lang="ts">
	import type { Arrive, Place } from '@bytebunker/event-schema';
	import type { ActivityPropsInterface } from '$lib/components/activity/ActivityPropsInterface.js';
	import LucideMapPin from '~icons/lucide/map-pin';
	import ActivityCard from '$lib/components/activity/ActivityCard.svelte';
	import { buildGoogleMapsPlaceUrl } from '$lib/components/activity/activityUtil.js';
	import { Button } from '@bytebunker/daisyui-components';
	import LucideMap from '~icons/lucide/map';

	interface ArriveActivity extends Arrive {
		target: Place;
	}

	let props: ActivityPropsInterface<ArriveActivity> = $props();
	let { activity } = props;

	let googleMapsPlaceUrl = $derived(
		buildGoogleMapsPlaceUrl(
			{ lat: activity.target.latitude, lng: activity.target.longitude },
			activity.target.placeId
		)
	);
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

<ActivityCard {...props} icon={LucideMapPin} type="Arrive">
	<div class="flex items-center">
		Arrived at {@render placeName(activity.target)}
	</div>
	{#snippet afterCardButtons()}
		{#if googleMapsPlaceUrl}
			<Button
				btnStyle="ghost"
				class="btn-circle"
				size="sm"
				href={googleMapsPlaceUrl}
				target="_blank"
				rel="external"><LucideMap /></Button
			>
		{/if}
	{/snippet}
</ActivityCard>
