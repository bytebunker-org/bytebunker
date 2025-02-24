<script lang="ts">
	import type { ASActivity } from '@bytebunker/event-schema';
	import type { ActivityPropsInterface } from '$lib/components/activity/ActivityPropsInterface.js';
	import LucideCircleHelp from '~icons/lucide/circle-help';
	import ActivityCard from '$lib/components/activity/ActivityCard.svelte';

	let props: ActivityPropsInterface<ASActivity> = $props();
	let { activity } = props;
</script>

<ActivityCard {...props} icon={LucideCircleHelp}>
	<div class="flex items-center">
		{#if activity.summary}
			{activity.summary}
		{:else}
			Unknown activity
		{/if}
	</div>
</ActivityCard>
