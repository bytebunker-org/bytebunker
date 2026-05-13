<script lang="ts">
	import type { EventActivity, Place } from '@bytebunker/event-schema';
	import type { ActivityPropsInterface } from '$lib/components/activity/ActivityPropsInterface.js';
	import LucideCalendar from '~icons/lucide/calendar';
	import LucideUsers from '~icons/lucide/users';
	import ActivityCard from '$lib/components/activity/ActivityCard.svelte';

	interface IcsEventActivity extends EventActivity {
		location?: Place;
	}

	let props: ActivityPropsInterface<IcsEventActivity> = $props();
	let { activity } = props;

	let locationName = $derived(activity.location?.name);
	let attendeeCount = $derived(activity.attendees?.length ?? 0);
</script>

<ActivityCard {...props} icon={LucideCalendar} type="Event">
	<div class="flex flex-col gap-0.5">
		<span class="font-bold text-neutral-700">{activity.summary}</span>
		{#if locationName}
			<span class="text-sm text-neutral-500">at {locationName}</span>
		{/if}
		{#if attendeeCount > 0}
			<span class="flex items-center gap-1 text-sm text-neutral-500">
				<LucideUsers class="h-3.5 w-3.5" />
				{attendeeCount}
				{attendeeCount === 1 ? 'attendee' : 'attendees'}
			</span>
		{/if}
	</div>
</ActivityCard>
