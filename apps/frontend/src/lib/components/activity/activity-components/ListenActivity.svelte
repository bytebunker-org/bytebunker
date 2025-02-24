<script lang="ts">
	import type { ASActivity, Listen } from '@bytebunker/event-schema';
	import type { ActivityPropsInterface } from '$lib/components/activity/ActivityPropsInterface.js';
	import ActivityCard from '$lib/components/activity/ActivityCard.svelte';
	import LucideMusic from '~icons/lucide/music';
	import LucidePlay from '~icons/lucide/play';
	import { Button } from '@bytebunker/daisyui-components';
	import { buildSpotifyOpenUrl } from '$lib/components/activity/activityUtil.js';

	interface ListenActivity extends Listen {
		object?: {
			'@type': 'Audio';
			name?: string;
			inAlbum?: string;
			byArtist?: string;
			identifier?: string;
		};
	}

	let props: ActivityPropsInterface<ListenActivity & ASActivity> = $props();
	let { activity } = props;

	let spotifyOpenUrl = $derived(buildSpotifyOpenUrl(activity.object?.identifier));
</script>

<ActivityCard {...props} icon={LucideMusic} type="Listen" class="group/spotify-activity">
	{#if activity?.object?.name}
		<div class="flex items-center text-nowrap">
			Listened to <span class="max-w-[30vw] truncate px-1 font-bold text-neutral-700"
				>{activity.object?.name}</span
			>
			by {activity.object?.byArtist}
			{#if activity.object?.identifier}{/if}
		</div>
	{:else}
		{activity.summary ?? 'Unknown song'}
	{/if}
	{#snippet afterCardButtons()}
		{#if spotifyOpenUrl}
			<Button
				btnStyle="ghost"
				class="btn-circle"
				size="sm"
				href={spotifyOpenUrl}
				target="_blank"
				rel="external"><LucidePlay /></Button
			>
		{/if}
	{/snippet}
</ActivityCard>
