<script lang="ts">
	import MainLayout from '$lib/components/MainLayout.svelte';
	import LucideSquareActivity from '~icons/lucide/square-activity';
	import ActivityTimelineWrapper from '$lib/components/activity/ActivityTimelineWrapper.svelte';
	import { onMount } from 'svelte';

	onMount(() => {
		document.documentElement.classList.add('hide-scrollbar');

		return () => {
			document.documentElement.classList.remove('hide-scrollbar');
		};
	});
</script>

<MainLayout icon={LucideSquareActivity} title="Activities" isHome>
	<ActivityTimelineWrapper searchRequest={{}} />
</MainLayout>
