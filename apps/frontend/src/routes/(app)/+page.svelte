<script lang="ts">
	import { Card, CardBody } from '@bytebunker/daisyui-components';
	import MainLayout from '$lib/components/MainLayout.svelte';
	import LucideSquareActivity from '~icons/lucide/square-activity';
	import ActivityTimeline from '$lib/components/activity/ActivityTimeline.svelte';
</script>

<MainLayout icon={LucideSquareActivity} title="Activities" isHome>
	<ActivityTimeline searchRequest={{}} />
</MainLayout>
