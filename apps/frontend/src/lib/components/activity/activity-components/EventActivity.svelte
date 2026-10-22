<script lang="ts">
	import type { ASActivity } from '@bytebunker/event-schema';
	import type { ActivityPropsInterface } from '$lib/components/activity/ActivityPropsInterface.js';
	import LucideCalendar from '~icons/lucide/calendar';
	import LucideUsers from '~icons/lucide/users';
	import LucideVideo from '~icons/lucide/video';
	import LucideUser from '~icons/lucide/user';
	import ActivityCard from '$lib/components/activity/ActivityCard.svelte';
	import StayActivity from './StayActivity.svelte';
	import {
		asBoolean,
		asRecord,
		asText,
		getAttendees,
		getOrganizerLabel,
		hasSecondaryType,
		pluralize,
		safeHref,
		type Loose
	} from '$lib/components/activity/activityDataUtil.js';

	let props: ActivityPropsInterface<ASActivity> = $props();

	let activity = $derived(props.activity as Loose);
	let locationName = $derived(asText(asRecord(activity.location)?.name));
	let attendees = $derived(getAttendees(props.activity));
	let declinedCount = $derived(
		attendees.filter((a) => a.status?.toLowerCase() === 'declined').length
	);
	let isCancelled = $derived(asText(activity.status)?.toLowerCase() === 'cancelled');
	let allDay = $derived(asBoolean(activity.allDay));
	let conferenceUrl = $derived(safeHref(activity.conferenceUrl));
	let calendarName = $derived(asText(activity.calendarName));
	let organizer = $derived(getOrganizerLabel(activity.organizer));
</script>

{#if hasSecondaryType(props.activity, 'Stay')}
	<StayActivity {...props} />
{:else}
	<ActivityCard
		{...props}
		icon={LucideCalendar}
		type="Event"
		class={isCancelled ? 'opacity-70' : ''}
	>
		<div class="flex flex-col gap-0.5">
			<span class={['font-bold text-neutral-700', isCancelled && 'line-through']}>
				{asText(activity.summary) ?? 'Event'}
			</span>
			<span class="flex flex-wrap items-center gap-x-2 text-sm text-neutral-500">
				{#if isCancelled}<span class="badge badge-error badge-soft badge-sm">Cancelled</span>{/if}
				{#if allDay}<span class="badge badge-ghost badge-sm">All day</span>{/if}
				{#if calendarName}<span>{calendarName}</span>{/if}
			</span>
			{#if locationName}
				<span class="text-sm text-neutral-500">at {locationName}</span>
			{/if}
			{#if organizer}
				<span class="flex items-center gap-1 text-sm text-neutral-500">
					<LucideUser class="h-3.5 w-3.5" />{organizer}
				</span>
			{/if}
			{#if attendees.length > 0}
				<span
					class="flex items-center gap-1 text-sm text-neutral-500"
					title={attendees.map((a) => a.name ?? a.email).join(', ')}
				>
					<LucideUsers class="h-3.5 w-3.5" />
					{pluralize(attendees.length, 'attendee')}
					{#if declinedCount}<span class="text-neutral-400">({declinedCount} declined)</span>{/if}
				</span>
			{/if}
			{#if conferenceUrl}
				<a
					class="link link-primary flex items-center gap-1 text-sm"
					href={conferenceUrl}
					target="_blank"
					rel="external noopener"><LucideVideo class="h-3.5 w-3.5" />Join meeting</a
				>
			{/if}
		</div>
	</ActivityCard>
{/if}
