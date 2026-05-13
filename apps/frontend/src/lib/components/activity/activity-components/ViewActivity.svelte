<script lang="ts">
	import type { ASActivity, View } from '@bytebunker/event-schema';
	import type { YouTubeViewActivityInterface, YouTubeVideoObjectInterface } from '@bytebunker/backend';
	import type { ActivityPropsInterface } from '$lib/components/activity/ActivityPropsInterface.js';
	import ActivityCard from '$lib/components/activity/ActivityCard.svelte';
	import LucideYoutube from '~icons/lucide/youtube';
	import LucidePlay from '~icons/lucide/play';
	import { Button } from '@bytebunker/daisyui-components';
	import { buildYouTubeWatchUrl } from '$lib/components/activity/activityUtil.js';

	interface ViewActivity extends View, YouTubeViewActivityInterface {
		object?: {
			'@type': 'Video';
			name?: string;
		} & Partial<YouTubeVideoObjectInterface>;
	}

	let props: ActivityPropsInterface<ViewActivity & ASActivity> = $props();
	let { activity } = props;

	let openUrl = $derived(
		activity.object?.videoUrl ??
			buildYouTubeWatchUrl(activity.object?.videoId, { music: activity.product === 'YouTubeMusic' })
	);
</script>

<ActivityCard {...props} icon={LucideYoutube} type="View" class="group/youtube-activity">
	{#if activity?.object?.name}
		<div class="flex items-center text-nowrap">
			Watched <span class="max-w-[30vw] truncate px-1 font-bold text-neutral-700"
				>{activity.object.name}</span
			>
			{#if activity.object.channelName}
				on {activity.object.channelName}
			{/if}
		</div>
	{:else}
		{activity.summary ?? 'Unknown video'}
	{/if}
	{#snippet afterCardButtons()}
		{#if openUrl}
			<Button
				btnStyle="ghost"
				class="btn-circle"
				size="sm"
				href={openUrl}
				target="_blank"
				rel="external"><LucidePlay /></Button
			>
		{/if}
	{/snippet}
</ActivityCard>
