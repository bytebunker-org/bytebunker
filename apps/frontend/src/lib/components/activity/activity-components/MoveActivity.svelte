<script lang="ts">
	import type { Move, Place } from '@bytebunker/event-schema';
	import type { GoogleTimelineActivityInterface } from '@bytebunker/backend';
	import type { ActivityTypeEnum } from '@bytebunker/event-schema/extension/google';
	import type { ActivityPropsInterface } from '$lib/components/activity/ActivityPropsInterface.js';
	import LucideRoute from '~icons/lucide/route';
	import LucideArrowRight from '~icons/lucide/arrow-right';
	import LucideMap from '~icons/lucide/map';
	import { t } from 'svelte-i18n';
	import ActivityCard from '$lib/components/activity/ActivityCard.svelte';
	import { googleActivityTypeIconMap } from '$lib/components/activity/activity-components/util/googleActivityTypeIconMap.js';
	import {
		buildGoogleMapsDirectionsUrl,
		calculateActivityDistance,
		shortEnglishDuration
	} from '$lib/components/activity/activityUtil.js';
	import { MapboxApi, type MapboxStyle } from '$lib/api/MapboxApi.js';
	import LucideTimer from '~icons/lucide/timer';
	import { Button } from '@bytebunker/daisyui-components';

	interface MoveActivity extends Move, GoogleTimelineActivityInterface {
		origin: Place & { placeId?: string };
		target: Place & { placeId?: string };
		activityType: ActivityTypeEnum;
	}

	let props: ActivityPropsInterface<MoveActivity> = $props();
	let { activity, cardSize, isFirstInGroup, isLastInGroup } = props;

	let movedDistanceKm = $derived(calculateActivityDistance(activity) ?? 0);
	let movedDistanceString = $derived(
		movedDistanceKm < 1
			? Math.floor(movedDistanceKm * 1000) + 'm'
			: movedDistanceKm?.toFixed(1) + 'km'
	);

	let icon = $derived(
		googleActivityTypeIconMap[activity.activityType]
			? googleActivityTypeIconMap[activity.activityType]
			: LucideRoute
	);

	function buildMapboxStaticTileUrl(): string | undefined {
		let style: MapboxStyle = 'day'; //dawn/day/dusk/night

		if (activity.startTime) {
			const hour = activity.startTime.setZone('Europe/Berlin').hour;

			if (hour >= 5 && hour < 8) {
				style = 'dawn';
			} else if (hour >= 8 && hour < 18) {
				style = 'day';
			} else if (hour >= 18 && hour < 21) {
				style = 'dusk';
			} else {
				style = 'night';
			}
		}

		let waypoints: { lat: number; lng: number }[] = [];
		let rawWaypoints: { lat: number; lng: number }[] = [];
		const startAndEnd: { lat: number; lng: number }[] = [
			activity.origin.latitude && activity.origin.longitude
				? { lat: activity.origin.latitude, lng: activity.origin.longitude }
				: undefined,
			activity.target.latitude && activity.target.longitude
				? { lat: activity.target.latitude, lng: activity.target.longitude }
				: undefined
		].filter(Boolean);

		if (Array.isArray(activity.waypointPath?.waypoints)) {
			waypoints = activity.waypointPath.waypoints.map((waypoint) => {
				return {
					lat: (waypoint.latE7 ?? 0) / 1e7,
					lng: (waypoint.lngE7 ?? 0) / 1e7
				};
			});
		}
		if (Array.isArray(activity.simplifiedRawPath?.points)) {
			rawWaypoints = activity.simplifiedRawPath.points.map((waypoint) => {
				return {
					lat: (waypoint.latE7 ?? 0) / 1e7,
					lng: (waypoint.lngE7 ?? 0) / 1e7
				};
			});
		}

		const waypointsToUse =
			waypoints.length > rawWaypoints.length
				? startAndEnd.length > waypoints.length
					? startAndEnd
					: waypoints
				: rawWaypoints;

		if (!waypointsToUse?.length) {
			return undefined;
		}

		return MapboxApi.buildMapboxStaticImageUrl({
			style,
			width: 700,
			height: 300,
			waypoints: waypointsToUse
		});
	}

	let duration = $derived(
		activity.startTime && activity.endTime ? activity.endTime.diff(activity.startTime) : undefined
	);

	let googleMapsDirectionsUrl = $derived(
		buildGoogleMapsDirectionsUrl(
			{ lat: activity.origin.latitude, lng: activity.origin.longitude },
			activity.origin.placeId,
			{ lat: activity.target.latitude, lng: activity.target.longitude },
			activity.target.placeId
		)
	);
</script>

{#snippet placeName(place: Place)}
	{#if place}
		<div
			class={['text-nowrap', cardSize === 'sm' ? 'text-neutral-600' : 'font-bold text-neutral-700']}
		>
			{#if place.name}
				{place.name}
			{:else}
				{place.latitude?.toFixed(3)}, {place.longitude?.toFixed(3)}
			{/if}
		</div>
	{/if}
{/snippet}

{#snippet moveDescription()}
	{#if activity.origin.name || activity.target.name}
		{@render placeName(activity.origin)}
		<LucideArrowRight class="mx-2 text-neutral-500" />
		{@render placeName(activity.target)}
		<span class="ml-1">{$t(`activity.move.activityType.${activity.activityType}`)}</span>
	{:else}
		<span>{movedDistanceString} {$t(`activity.move.activityType.${activity.activityType}`)}</span>
	{/if}
{/snippet}

<ActivityCard {...props} {icon} type="Move" noCardStyles={cardSize === 'lg'} maxCardHeight={500}>
	{#if cardSize === 'sm' || cardSize === 'md'}
		<div class="flex items-center">
			{@render moveDescription()}
		</div>
	{:else}
		{@const mapboxStaticTileUrl = buildMapboxStaticTileUrl()}
		<div class="flex flex-col">
			<div
				class="bg-base-200 {mapboxStaticTileUrl
					? 'rounded-t-box'
					: 'rounded-box'} flex items-center justify-between gap-4 px-4 py-3"
			>
				<div class="flex items-center">
					<LucideRoute />
					<span class="mx-1 font-bold">{movedDistanceString}</span><span
						>{$t(`activity.move.activityType.${activity.activityType}`)}</span
					>
				</div>
				{#if duration}
					<div class="flex items-center gap-1">
						<span class="font-bold">{shortEnglishDuration(duration.as('milliseconds'))}</span>
						<LucideTimer />
					</div>
				{/if}
			</div>
			{#if mapboxStaticTileUrl}
				<img src={mapboxStaticTileUrl} loading="lazy" alt="" class="w-full object-cover" />
			{/if}
		</div>
	{/if}
	{#snippet afterCardButtons()}
		{#if googleMapsDirectionsUrl}
			<Button
				btnStyle="ghost"
				class="btn-circle"
				size="sm"
				href={googleMapsDirectionsUrl}
				target="_blank"
				rel="external"
			>
				<LucideMap />
			</Button>
		{/if}
	{/snippet}
</ActivityCard>
