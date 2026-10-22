<script lang="ts">
	import type { ASActivity } from '@bytebunker/event-schema';
	import type { ActivityPropsInterface } from '$lib/components/activity/ActivityPropsInterface.js';
	import ActivityCard from '$lib/components/activity/ActivityCard.svelte';
	import LucideMusic from '~icons/lucide/music';
	import LucidePlay from '~icons/lucide/play';
	import LucideSkipForward from '~icons/lucide/skip-forward';
	import { Button } from '@bytebunker/daisyui-components';
	import {
		buildAudioOpenUrl,
		shortEnglishDuration
	} from '$lib/components/activity/activityUtil.js';
	import {
		asBoolean,
		asNumber,
		asRecord,
		asText,
		isShortPlay,
		nameOf,
		type Loose
	} from '$lib/components/activity/activityDataUtil.js';

	let props: ActivityPropsInterface<ASActivity> = $props();

	let activity = $derived(props.activity as Loose);
	// MusicRecording / SpotifyTrack / Audio (artist), PodcastEpisode (show), AudiobookChapter (book/author)
	let object = $derived(asRecord(activity.object));
	let name = $derived(asText(object?.name));
	let creator = $derived(
		nameOf(object?.byArtist) ??
			asText(object?.showName) ??
			nameOf(object?.byAuthor) ??
			asText(object?.bookName)
	);
	let openUrl = $derived(buildAudioOpenUrl(asText(object?.identifier)));
	let msPlayed = $derived(asNumber(activity.msPlayed));
	let skipped = $derived(asBoolean(activity.skipped));
	let dimmed = $derived(skipped || isShortPlay(msPlayed));
	let platform = $derived(asText(activity.platform));
</script>

<ActivityCard
	{...props}
	icon={LucideMusic}
	type="Listen"
	class={['group/spotify-activity', dimmed && 'opacity-60']}
>
	{#if name}
		<div class="flex items-center text-nowrap">
			Listened to <span class="max-w-[30vw] truncate px-1 font-bold text-neutral-700">{name}</span>
			{#if creator}by {creator}{/if}
			{#if skipped}<span title="Skipped"
					><LucideSkipForward class="ml-1 size-3.5 text-neutral-500" /></span
				>{/if}
		</div>
		{#if (msPlayed !== undefined && props.cardSize !== 'sm') || platform}
			<span class="text-xs text-neutral-500">
				{#if msPlayed !== undefined}{shortEnglishDuration(msPlayed)}{/if}
				{#if platform}{msPlayed !== undefined ? ' · ' : ''}{platform}{/if}
			</span>
		{/if}
	{:else}
		{asText(activity.summary) ?? 'Unknown song'}
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
