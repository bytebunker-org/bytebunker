<script lang="ts">
	import type { ASActivity } from '@bytebunker/event-schema';
	import type { ActivityPropsInterface } from '$lib/components/activity/ActivityPropsInterface.js';
	import ActivityCard from '$lib/components/activity/ActivityCard.svelte';
	import LucideBookmark from '~icons/lucide/bookmark';
	import LucideMapPinPlus from '~icons/lucide/map-pin-plus';
	import LucideFolder from '~icons/lucide/folder';
	import LucideExternalLink from '~icons/lucide/external-link';
	import { Button } from '@bytebunker/daisyui-components';
	import {
		asRecord,
		asText,
		getHostname,
		hasSecondaryType,
		safeHref,
		type Loose
	} from '$lib/components/activity/activityDataUtil.js';

	let props: ActivityPropsInterface<ASActivity> = $props();

	let activity = $derived(props.activity as Loose);
	let object = $derived(asRecord(activity.object));
	let isSavedPlace = $derived(hasSecondaryType(props.activity, 'SavedPlace'));
	let name = $derived(asText(object?.name) ?? asText(object?.pageUrl) ?? asText(activity.summary));
	let href = $derived(safeHref(object?.pageUrl));
	let folderPath = $derived(asText(activity.folderPath));
</script>

<ActivityCard {...props} icon={isSavedPlace ? LucideMapPinPlus : LucideBookmark} type="Add">
	<div class="flex flex-col gap-0.5">
		<span class="flex items-center gap-1">
			{isSavedPlace ? 'Saved place' : 'Bookmarked'}
			<span class="max-w-[40vw] truncate font-bold text-neutral-700 lg:max-w-[25vw]">
				{name ?? 'Unknown'}
			</span>
		</span>
		{#if !isSavedPlace}
			<span class="flex items-center gap-2 text-sm text-neutral-500">
				{#if getHostname(object?.pageUrl)}<span>{getHostname(object?.pageUrl)}</span>{/if}
				{#if folderPath}
					<span class="flex items-center gap-1"><LucideFolder class="size-3.5" />{folderPath}</span>
				{/if}
			</span>
		{/if}
	</div>
	{#snippet afterCardButtons()}
		{#if href}
			<Button
				btnStyle="ghost"
				class="btn-circle"
				size="sm"
				{href}
				target="_blank"
				rel="external noopener"><LucideExternalLink /></Button
			>
		{/if}
	{/snippet}
</ActivityCard>
