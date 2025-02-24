<script lang="ts">
	import type { ASActivity, Listen } from '@bytebunker/event-schema';
	import type { ActivityPropsInterface } from '$lib/components/activity/ActivityPropsInterface.js';
	import ActivityCard from '$lib/components/activity/ActivityCard.svelte';
	import LucideMusic from '~icons/lucide/music';

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

	let spotifyOpenUrl = $derived(() => {
		const identifier = activity.object?.identifier;
		let type = 'track';
		let id = identifier;

		/*const uriMatch = identifier &/spotify:([\w+]):[\w+]/.exec(identifier);

		if (uriMatch) {
			type = uriMatch[1];
			id = uriMatch[2];
		}*/

		return identifier ? `https://open.spotify.com/${type}/${id}` : undefined;
	});
</script>

<ActivityCard {...props} icon={LucideMusic} type="Listen">
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
</ActivityCard>
